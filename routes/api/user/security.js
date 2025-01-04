const express = require('express');
const { authenticator } = require('otplib');
const authenticateToken = require('../../../middleware/authenticateToken');
const { setTwoFactorSecret, getTwoFactorSecret, disableTwoFactor, logAuditAction } = require('../../../database');

const router = express.Router();

// Check 2FA Status
router.get('/2fa-status', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        getTwoFactorSecret(userId, (err, secret) => {
            if (err) {
                console.error('Error checking 2FA status:', err.message);
                return res.status(500).json({ error: 'Failed to fetch 2FA status.' });
            }

            // If no secret is found, 2FA is not enabled
            const isTwoFactorEnabled = !!secret;
            res.json({ enabled: isTwoFactorEnabled });
        });
    } catch (error) {
        console.error('Error in /2fa-status route:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Enable 2FA
router.post('/enable-2fa', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Check if 2FA is already enabled
        getTwoFactorSecret(userId, (err, existingSecret) => {
            if (err) {
                console.error('Error checking 2FA status:', err.message);
                return res.status(500).json({ error: 'Internal server error.' });
            }

            if (existingSecret) {
                return res.status(400).json({ error: '2FA is already enabled.' });
            }

            // Generate a new 2FA secret
            const newSecret = authenticator.generateSecret();

            // Save the 2FA secret in the database
            setTwoFactorSecret(userId, newSecret, (err) => {
                if (err) {
                    console.error('Error storing 2FA secret:', err.message);
                    return res.status(500).json({ error: 'Failed to enable 2FA.' });
                }

                // Generate an otpauth URL for the authenticator app
                const otpauthUrl = authenticator.keyuri(req.user.email, 'TokenHamster', newSecret);

                // Return the otpauth URL to the frontend
                res.json({ otpauthUrl });
            });
        });
    } catch (error) {
        console.error('Error enabling 2FA:', error.message);
        res.status(500).json({ error: 'Failed to enable 2FA.' });
    }
});

router.post('/verify-2fa', authenticateToken, async (req, res) => {
    const { otp } = req.body;
    const userId = req.user.id;

    try {
        getTwoFactorSecret(userId, (err, secret) => {
            if (err) {
                console.error('Error retrieving 2FA secret:', err.message);
                return res.status(500).json({ error: 'Failed to verify 2FA.' });
            }

            if (!secret) {
                return res.status(400).json({ error: '2FA is not enabled for this user.' });
            }

            const isValid = authenticator.verify({ token: otp, secret });
            if (!isValid) {
                return res.status(400).json({ error: 'Invalid OTP.' });
            }

            console.log(`2FA verified for user ID: ${userId}`);
            res.json({ message: '2FA verification successful.' });
        });
    } catch (error) {
        console.error('Error verifying 2FA:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Disable 2FA
router.post('/disable-2fa', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        getTwoFactorSecret(userId, (err, secret) => {
            if (err) {
                console.error('Error retrieving 2FA secret:', err.message);
                return res.status(500).json({ error: 'Failed to disable 2FA.' });
            }

            if (!secret) {
                return res.status(400).json({ error: '2FA is not enabled for this user.' });
            }

            // Disable 2FA in the database
            disableTwoFactor(userId, (err) => {
                if (err) {
                    console.error('Error disabling 2FA:', err.message);
                    return res.status(500).json({ error: 'Failed to disable 2FA.' });
                }

                console.log(`2FA disabled for user ID: ${userId}`);
                res.json({ message: 'Two-factor authentication has been disabled.' });
            });
        });
    } catch (error) {
        console.error('Error in /disable-2fa route:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Generic Log Audit Action
router.post("/audit", authenticateToken, (req, res) => {
    const { action, portfolioId, cryptoSymbol, details } = req.body;
    const userId = req.user.id; // Extract user ID from authenticated token

    if (!action) {
        return res.status(400).json({ error: "Action is required" });
    }

    logAuditAction(
        userId,
        portfolioId || null,
        action,
        cryptoSymbol || null,
        details || null,
        (err) => {
            if (err) {
                console.error("Failed to log audit action:", err.message);
                return res.status(500).json({ error: "Failed to log audit action" });
            }
            res.status(200).json({ message: "Audit logged successfully" });
        }
    );
});

module.exports = router;

const express = require('express');
const { authenticator } = require('otplib');
const authenticateToken = require('../../../middleware/authenticateToken');
const { decrypt, setTwoFactorSecretAndSeed, getTwoFactorSecret, disableTwoFactor, logAuditAction, setTemporaryTwoFactorData, deleteTemporaryTwoFactorData, getTemporaryTwoFactorData, getTwoFactorRecoverySeed } = require('../../../database');
const bip39 = require('bip39');

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

            // Generate a new 2FA secret and recovery seed
            const newSecret = authenticator.generateSecret();
            const recoveryPhrase = bip39.generateMnemonic(); // Generate 12-word recovery phrase

            // Save the secret and recovery seed temporarily
            setTemporaryTwoFactorData(userId, newSecret, recoveryPhrase, (err) => {
                if (err) {
                    console.error('Error storing temporary 2FA data:', err.message);
                    return res.status(500).json({ error: 'Failed to initiate 2FA setup.' });
                }

                // Generate an otpauth URL for the authenticator app
                const otpauthUrl = authenticator.keyuri(req.user.email, 'TokenHamster', newSecret);

                // Return the otpauth URL and recovery phrase to the frontend
                res.json({ otpauthUrl, recoveryPhrase });
            });
        });
    } catch (error) {
        console.error('Error enabling 2FA:', error.message);
        res.status(500).json({ error: 'Failed to enable 2FA.' });
    }
});

// verify and activate
router.post('/verify-2fa', authenticateToken, async (req, res) => {
    const { otp } = req.body;
    const userId = req.user.id;

    try {
        // Retrieve temporary 2FA data
        getTemporaryTwoFactorData(userId, (err, tempData) => {
            if (err || !tempData) {
                console.error('Error retrieving temporary 2FA data:', err?.message || 'No data found');
                return res.status(400).json({ error: '2FA setup not initiated.' });
            }

            // Validate data before decryption
            if (!tempData.secret || !tempData.recovery_phrase) {
                console.error(`Missing data for user ID ${userId}:`, tempData);
                return res.status(400).json({ error: 'Temporary 2FA data is invalid or incomplete.' });
            }

            // Decrypt the secret and recovery phrase
            let decryptedSecret, decryptedRecoveryPhrase;
            try {
                decryptedSecret = decrypt(tempData.secret);
                decryptedRecoveryPhrase = decrypt(tempData.recovery_phrase);
            } catch (decryptionError) {
                console.error(`Decryption failed for user ID ${userId}:`, decryptionError.message);
                return res.status(500).json({ error: 'Failed to decrypt 2FA data.' });
            }

            // Verify the OTP against the secret
            const isValid = authenticator.verify({ token: otp, secret: decryptedSecret });
            if (!isValid) {
                return res.status(400).json({ error: 'Invalid OTP.' });
            }

            // Save the secret and recovery phrase permanently
            setTwoFactorSecretAndSeed(userId, decryptedSecret, decryptedRecoveryPhrase, (err) => {
                if (err) {
                    console.error('Error enabling 2FA:', err.message);
                    return res.status(500).json({ error: 'Failed to enable 2FA.' });
                }

                console.log(`2FA enabled for user ID: ${userId}`);
                res.json({ message: '2FA verification successful.' });
            });
        });
    } catch (error) {
        console.error('Unexpected error during 2FA verification:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// cancel 2fa and rollback
router.post('/cancel-2fa-setup', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Call the database helper to delete temporary 2FA data
        deleteTemporaryTwoFactorData(userId, (err) => {
            if (err) {
                console.error('Error canceling 2FA setup:', err.message);
                return res.status(500).json({ error: 'Failed to cancel 2FA setup.' });
            }

            // console.log(`Temporary 2FA setup canceled for user ID: ${userId}`); // DEBUG
            res.json({ message: '2FA setup canceled.' });
        });
    } catch (error) {
        console.error('Unexpected error during 2FA setup cancellation:', error.message);
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

// display mnenomic phrase to recover 2fa
router.get('/get-2fa-seed', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        getTwoFactorRecoverySeed(userId, (err, encryptedSeed) => {
            if (err) {
                console.error(`Error retrieving recovery seed for user ID ${userId}:`, err.message);
                return res.status(404).json({ error: 'Recovery seed not found.' });
            }

            try {
                const recoverySeed = decrypt(encryptedSeed);
                res.json({ recoverySeed });
            } catch (decryptionError) {
                console.error(`Error decrypting recovery seed for user ID ${userId}:`, decryptionError.message);
                res.status(500).json({ error: 'Failed to decrypt recovery seed.' });
            }
        });
    } catch (error) {
        console.error(`Unexpected error in /get-2fa-seed for user ID ${userId}:`, error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/recover-2fa', authenticateToken, async (req, res) => {
    const { email, recoveryPhrase } = req.body;

    try {
        // Validate user existence
        const query = `SELECT id, sfa_seed_encrypted FROM users WHERE email = ?`;
        db.get(query, [email], (err, user) => {
            if (err || !user) {
                console.error(`Error retrieving user for email ${email}:`, err?.message || 'User not found');
                return res.status(404).json({ error: 'Invalid email or recovery phrase.' });
            }

            try {
                // Decrypt and validate the recovery phrase
                const decryptedSeed = decrypt(user.sfa_seed_encrypted);
                if (decryptedSeed !== recoveryPhrase) {
                    console.warn(`Invalid recovery phrase for email ${email}`);
                    return res.status(400).json({ error: 'Invalid email or recovery phrase.' });
                }

                // Disable 2FA for the user
                disableTwoFactor(user.id, (err) => {
                    if (err) {
                        console.error(`Error disabling 2FA for user ID ${user.id}:`, err.message);
                        return res.status(500).json({ error: 'Failed to recover 2FA.' });
                    }

                    console.log(`2FA disabled for user ID ${user.id}`);
                    res.json({ message: '2FA has been disabled. You can log in without OTP.' });
                });
            } catch (decryptionError) {
                console.error(`Error decrypting recovery phrase for email ${email}:`, decryptionError.message);
                res.status(500).json({ error: 'Failed to process recovery phrase.' });
            }
        });
    } catch (error) {
        console.error(`Unexpected error during 2FA recovery for email ${email}:`, error.message);
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

// routes/api/user/profile.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const authenticateToken = require('../../../middleware/authenticateToken');
const { db, logAuditAction } = require('../../../database');
const config = require('../../../config');

const router = express.Router();

// Ensure temporary directory exists
const tempDir = path.join(__dirname, '../../../temp/uploads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Temporary upload directory created at: ${tempDir}`);
}

// Configure multer for file uploads
const upload = multer({
    dest: tempDir, // Temporary upload directory
    limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 2MB
});

// Profile endpoint
router.get('/', authenticateToken, (req, res) => {
    const { id } = req.user;

    const query = `SELECT id, username, email FROM users WHERE id = ?`;
    db.get(query, [id], (err, user) => {
        if (err) {
            console.error('Error fetching user profile:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            profilePicture: `http://localhost:4467/api/user/profile/image/${user.id}`,
        });
    });
});

router.get('/image/:id', authenticateToken, (req, res) => {
    const userId = req.params.id;

    const query = `SELECT profilePicture FROM users WHERE id = ?`;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('Error fetching image:', err.message);
            return res.status(500).send('Internal server error');
        }

        if (!row || !row.profilePicture) {
            return res.status(404).send('Image not found');
        }

        // Dynamically set CORS headers
        const allowedOrigins = ['https://www.tokenhamster.com', 'https://tokenhamster.com', 'http://localhost:8080'];
        const origin = req.headers.origin;

        if (allowedOrigins.includes(origin)) {
            res.set({
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
                'Content-Type': 'image/jpeg', // Adjust MIME type as needed
            });
        } else {
            console.error(`[CORS] Origin not allowed: ${origin}`);
            return res.status(403).send('Forbidden');
        }

        res.send(row.profilePicture);
    });
});

// delete account endpoint
router.delete('/delete', authenticateToken, (req, res) => {
    const { id } = req.user;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Mark user as deleted
        db.run(`UPDATE users SET deleted = 1 WHERE id = ?`, [id], (userErr) => {
            if (userErr) {
                console.error('Error marking user as deleted:', userErr.message);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to mark user as deleted.' });
            }

            // Mark portfolios as deleted
            db.run(`UPDATE portfolios SET deleted = 1 WHERE user_id = ?`, [id], (portfolioErr) => {
                if (portfolioErr) {
                    console.error('Error marking portfolios as deleted:', portfolioErr.message);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to mark portfolios as deleted.' });
                }

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        console.error('Error committing transaction:', commitErr.message);
                        return res.status(500).json({ error: 'Failed to complete account deletion.' });
                    }

                    // Log the audit action
                    logAuditAction(
                        id,
                        null, // No specific portfolio
                        'DELETE_ACCOUNT',
                        null, // No specific crypto
                        JSON.stringify({
                            message: 'User account marked as inactive. According to AML regulations, data must be retained.',
                        }),
                        (auditErr) => {
                            if (auditErr) {
                                console.warn('Failed to log account deletion audit:', auditErr.message);
                            }
                        }
                    );

                    res.json({ message: 'Account and associated portfolios deleted successfully.' });
                });
            });
        });
    });
});

// audit logs
router.get('/audit/logs', (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
        SELECT action, crypto_symbol, timestamp, details
        FROM audit_log
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    `;

    db.all(query, [userId, parseInt(limit), parseInt(offset)], (err, rows) => {
        if (err) {
            console.error('Error fetching audit logs:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check if there's an ADD_PORTFOLIO log
        const hasPortfolioCreationLog = rows.some(row => row.action === 'ADD_PORTFOLIO');

        if (!hasPortfolioCreationLog) {
            // Fetch portfolio creation time from the database
            db.get(
                `SELECT created_at AS timestamp FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'`,
                [userId],
                (portfolioErr, portfolio) => {
                    if (portfolioErr) {
                        console.error('Error fetching portfolio creation time:', portfolioErr.message);
                        return res.json(rows); // Return existing rows without adding a log
                    }

                    if (portfolio) {
                        rows.unshift({
                            action: 'ADD_PORTFOLIO',
                            crypto_symbol: null,
                            timestamp: portfolio.timestamp || null,
                            details: null,
                        });
                    }

                    res.json(rows);
                }
            );
        } else {
            res.json(rows);
        }
    });
});

// Export audit log
router.get('/audit/export', authenticateToken, (req, res) => {
    const userId = req.user.id;

    const query = `
        SELECT action, crypto_symbol, timestamp, details
        FROM audit_log
        WHERE user_id = ?
        ORDER BY timestamp DESC
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching audit log for export:', err.message);
            return res.status(500).json({ error: 'Failed to fetch audit log.' });
        }

        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'No audit logs found.' });
        }

        // Convert rows to CSV
        const csvHeaders = 'action,crypto_symbol,timestamp,details\n';
        const csvRows = rows
            .map(row => `${row.action},${row.crypto_symbol || 'N/A'},${row.timestamp},${row.details || 'N/A'}`)
            .join('\n');

        const csvContent = csvHeaders + csvRows;

        // Send CSV as attachment
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit_log.csv"');
        res.send(csvContent);
    });
});

module.exports = router;

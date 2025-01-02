// routes/api/user/profile.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const authenticateToken = require('../../../middleware/authenticateToken');
const { db } = require('../../../database');
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

// get profile picture
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

        res.set('Content-Type', 'image/jpeg'); // Adjust MIME type as needed
        res.send(row.profilePicture);
    });
});

// delete account endpoint
router.delete('/', authenticateToken, (req, res) => {
    const { id } = req.user;

    // Fetch the username of the user
    db.get(`SELECT username FROM users WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error('Error fetching user for deletion:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deletion of the admin account
        if (row.username === 'admin') {
            return res.status(403).json({ error: 'Admin account cannot be deleted' });
        }

        // Proceed with deletion
        db.run(`DELETE FROM users WHERE id = ?`, [id], (err) => {
            if (err) {
                console.error('Error deleting user:', err.message);
                return res.status(500).json({ error: 'Failed to delete account' });
            }
            res.json({ message: 'Account deleted successfully' });
        });
    });
});

module.exports = router;

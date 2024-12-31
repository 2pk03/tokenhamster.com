const express = require('express');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const authenticateToken = require('../../../middleware/authenticateToken');
const db = require('../../../database');

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

// profile picture endpoint
router.post('/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    const { id } = req.user;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({ error: 'Invalid file type. Only PNG, JPG, and WEBP are allowed.' });
    }

    const targetDir = path.join(__dirname, '../../../public/uploads/profile_pictures');
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Target directory created at: ${targetDir}`);
    }

    const targetPath = path.join(targetDir, `${id}_${Date.now()}.webp`);

    try {
        // Resize and convert the image
        await sharp(req.file.path)
            .resize(512, 512, { fit: 'inside' }) // Resize to 512x512, maintain aspect ratio
            .toFormat('webp') // Convert to webp format
            .toFile(targetPath); // Save processed image to target path

        // Delete the temporary file after processing
        fs.unlink(req.file.path, (err) => {
            if (err) {
                console.error('Error deleting temporary file:', err.message);
            }
        });

        // Save the profile picture path in the database
        const relativePath = `/uploads/profile_pictures/${path.basename(targetPath)}`;
        db.run(
            `UPDATE users SET profilePicture = ? WHERE id = ?`,
            [relativePath, id],
            (err) => {
                if (err) {
                    console.error('Error updating profile picture:', err.message);
                    return res.status(500).json({ error: 'Failed to update profile picture' });
                }
                res.json({ message: 'Profile picture updated successfully', profilePicture: relativePath });
            }
        );
    } catch (error) {
        console.error('Error processing profile picture:', error.message);
        res.status(500).json({ error: 'Failed to process profile picture' });
    }
});

// Profile endpoint
router.get('/', authenticateToken, (req, res) => {
    const { id, username } = req.user;

    db.getUserByUsername(username, (err, user) => {
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
            profilePicture: user.profilePicture || '/logo.webp',
        });
    });
});

// update profile endpoint
router.put('/', authenticateToken, (req, res) => {
    const { id } = req.user;
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    db.run(
        `UPDATE users SET username = ?, email = ? WHERE id = ?`,
        [name, email, id],
        (err) => {
            if (err) {
                console.error('Error updating user profile:', err.message);
                return res.status(500).json({ error: 'Failed to update profile' });
            }
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

// update password endpoint
router.put('/password', authenticateToken, async (req, res) => {
    const { id } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    db.get(`SELECT password FROM users WHERE id = ?`, [id], async (err, user) => {
        if (err) {
            console.error('Error fetching user password:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.run(
            `UPDATE users SET password = ? WHERE id = ?`,
            [hashedPassword, id],
            (updateErr) => {
                if (updateErr) {
                    console.error('Error updating password:', updateErr.message);
                    return res.status(500).json({ error: 'Failed to update password' });
                }
                res.json({ message: 'Password updated successfully' });
            }
        );
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

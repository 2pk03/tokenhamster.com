// routes/api/user/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../../database');
const authenticateToken = require('../../../middleware/authenticateToken');

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

// Register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  console.log(`Attempting to register user: ${username}, email: ${email}`);
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.addUser(username, email, hashedPassword, (err, userId) => {
      if (err) {
        console.error(`Error registering user: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      console.log(`User registered successfully: ${username}`);
      res.status(201).json({ id: userId, username });
    });
  } catch (err) {
    console.error(`Server error during registration: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log(`Login attempt for username: ${username}`);

  // Fetch user from the database
  db.getUserByUsername(username, async (err, user) => {
    if (err) {
      console.error(`Database error during login for ${username}:`, err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!user) {
      console.warn(`Login failed. User not found: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      // Compare password hashes
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.warn(`Password mismatch for username: ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
      console.log(`Token successfully generated for user: ${username}`);

      res.json({ token });
    } catch (error) {
      console.error(`Error during login for ${username}:`, error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Refresh token endpoint
router.post('/refresh-token', authenticateToken, (req, res) => {
  const { id } = req.user;
  const now = Math.floor(Date.now() / 1000);
  const tokenExp = req.user.exp || 0; // Ensure `exp` exists
  const timeLeft = tokenExp - now;

  // Only refresh if the token expires in the next 5 minutes
  if (timeLeft > 5 * 60) {
    console.log('Token refresh not needed. Time left (seconds):', timeLeft);
    return res.status(400).json({ message: 'Token refresh not needed yet.' });
  }

  const newToken = jwt.sign({ id }, SECRET_KEY, { expiresIn: '15m' });
  console.log('Token refreshed for user ID:', id);

  res.json({ token: newToken });
});

module.exports = router;

// routes/api/user/auth.js

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../../database');
const authenticateToken = require('../../../middleware/authenticateToken');
const { trackActiveUsers, getActiveUsers } = require('../../../middleware/countUsers');
// const { passport, loadStrategies } = require('../../../middleware/oauthprovider');
const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

// Apply `trackActiveUsers` middleware globally
router.use(trackActiveUsers);

// utility functions
const authState = {
  token: null,
  isAuthenticated: false,
};

function updateAuthState(token) {
  authState.token = token;
  authState.isAuthenticated = !!token;
}

function clearAuthState() {
  authState.token = null;
  authState.isAuthenticated = false;
}

// Oauth Providers, dynamically load OAuth strategies
// loadStrategies();

// Google Login Route
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google Callback Route
// router.get(
//   '/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   (req, res) => {
//     const token = jwt.sign({ id: req.user.id, email: req.user.email }, SECRET_KEY, { expiresIn: '1h' });
//     res.redirect(`/login?token=${token}`); // Redirect back to frontend with token
//   }
// );

// Public Routes

router.post('/google/validate', async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists, create if not
    let user = await db.getUserByGoogleId(googleId);
    let isNewUser = false;

    if (!user) {
      isNewUser = true; // User is being created
      user = await db.createUser({ email, googleId, name, picture });
    }

    // Generate a JWT
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, {
      expiresIn: '1h',
    });

    updateAuthState(token);
    res.json({ token, isNewUser });
  } catch (error) {
    console.error('Error validating Google ID token:', error);
    res.status(401).json({ error: 'Invalid Google ID token' });
  }
});

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

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log(`Login attempt for username: ${username}`);

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
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.warn(`Password mismatch for username: ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
      console.log(`Token successfully generated for user: ${username}`);

      updateAuthState(token);
      res.json({ token });
    } catch (error) {
      console.error(`Error during login for ${username}:`, error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Protected Routes
router.post('/refresh-token', authenticateToken, (req, res) => {
  const { id } = req.user;
  const now = Math.floor(Date.now() / 1000);
  const tokenExp = req.user.exp || 0;
  const timeLeft = tokenExp - now;

  if (timeLeft > 5 * 60) {
    console.log('Token refresh not needed. Time left (seconds):', timeLeft);
    return res.status(400).json({ message: 'Token refresh not needed yet.' });
  }

  const newToken = jwt.sign({ id }, SECRET_KEY, { expiresIn: '15m' });
  console.log('Token refreshed for user ID:', id);

  res.json({ token: newToken });
});

router.get('/active-users', authenticateToken, (req, res) => {
  try {
    const activeUsers = getActiveUsers();
    res.json({ count: activeUsers.size });
  } catch (error) {
    console.error('Error fetching active users:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

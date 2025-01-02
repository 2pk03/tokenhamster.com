// routes/api/user/auth.js

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../../database');
const axios = require('axios');
const fs = require('fs');
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
  user: null, // Track user details
};

function updateAuthState(token, user = null) {
  authState.token = token;
  authState.isAuthenticated = !!token;
  authState.user = user || (token ? jwt.verify(token, SECRET_KEY) : null); // Decode token for user info
}

function clearAuthState() {
  authState.token = null;
  authState.isAuthenticated = false;
  authState.user = null;
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

// google login oauth2
router.post('/google/validate', async (req, res) => {
  const { idToken } = req.body;

  try {
      const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const { sub: googleId, email, name, picture } = payload;

      // Fetch the image from the Google URL
      const response = await axios.get(picture, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data, 'binary');

      // Check if user exists
      db.getUserByGoogleId(googleId, async (err, user) => {
          if (err) {
              console.error('Database error:', err.message);
              return res.status(500).json({ error: 'Internal server error' });
          }

          if (!user) {
              // Create user with profile picture
              db.createUserWithImage({ email, googleId, name, imageBuffer }, (createErr, newUser) => {
                  if (createErr) {
                      console.error('Error creating user:', createErr.message);
                      return res.status(500).json({ error: 'Internal server error' });
                  }

                  console.log('User created:', newUser);

                  // Create a default portfolio for the new user
                  db.createPortfolio(newUser.id, 'Default Portfolio', (portfolioErr, portfolioId) => {
                      if (portfolioErr) {
                          console.error('Error creating default portfolio:', portfolioErr.message);
                          return res.status(500).json({ error: 'Failed to create default portfolio.' });
                      }
                      console.log('Default portfolio created with ID:', portfolioId);

                      // Generate token for the newly created user
                      const token = jwt.sign({ id: newUser.id, email: newUser.email }, SECRET_KEY, {
                          expiresIn: '1h',
                      });
                      return res.json({ token });
                  });
              });
          } else {
              // Optionally, update the user's profile picture
              db.updateUserImage(googleId, imageBuffer, (updateErr) => {
                  if (updateErr) {
                      console.error('Error updating user image:', updateErr.message);
                      return res.status(500).json({ error: 'Internal server error' });
                  }
                  console.log('User image updated');
              });

              // Generate token for the existing user
              const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, {
                  expiresIn: '1h',
              });
              res.json({ token });
          }
      });
  } catch (error) {
      console.error('Error during Google OAuth:', error.message);
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

      // Update Vuex-like auth state
      updateAuthState(token, user);

      res.json({ token });
    } catch (error) {
      console.error(`Error during login for ${username}:`, error.message);
      clearAuthState();
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

  // Update Vuex-like auth state
  updateAuthState(newToken);

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

router.post('/logout', (req, res) => {
  console.log('User logged out.');
  clearAuthState();
  res.status(200).json({ message: 'Logged out successfully.' });
});

module.exports = router;

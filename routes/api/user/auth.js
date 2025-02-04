// routes/api/user/auth.js

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, getUserByGoogleId, createUserWithImage, updateUserImage, logAuditAction, getTwoFactorSecret, getTwoFactorRecoverySeed, decrypt, disableTwoFactor } = require('../../../database');
const axios = require('axios');
const fs = require('fs');
const authenticateToken = require('../../../middleware/authenticateToken');
const { trackActiveUsers, getActiveUsers } = require('../../../middleware/countUsers');
// const { passport, loadStrategies } = require('../../../middleware/oauthprovider');
const { OAuth2Client } = require('google-auth-library');
const { authenticator } = require('otplib');
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

/*
// Oauth Providers, dynamically load OAuth strategies - for later
loadStrategies();

Google Login Route
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

Google Callback Route
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, SECRET_KEY, { expiresIn: '1h' });
    res.redirect(`/login?token=${token}`); // Redirect back to frontend with token
  }
);
*/

router.post('/google/validate', async (req, res) => {
  const { idToken, otp, recoveryPhrase } = req.body;

  try {
    // Verify ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Fetch the profile image
    const response = await axios.get(picture, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Check if user exists
    const user = await new Promise((resolve, reject) => {
      getUserByGoogleId(googleId, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    let userId;
    if (!user) {
      const newUser = await new Promise((resolve, reject) => {
        createUserWithImage({ email, googleId, name, imageBuffer }, (err, createdUser) => {
          if (err) reject(err);
          else resolve(createdUser);
        });
      });
      userId = newUser.id;

      // Log account creation
      logAuditAction(
        userId,
        null,
        'CREATE_ACCOUNT',
        null,
        JSON.stringify({ message: 'User account created via Google OAuth.' }),
        (auditErr) => {
          if (auditErr) console.warn('Failed to log account creation audit:', auditErr.message);
        }
      );
    } else if (user.deleted === 1) {
      userId = user.id;

      // Reactivate user
      await new Promise((resolve, reject) => {
        const reactivateQuery = `
          UPDATE users SET deleted = 0, profilePicture = ? WHERE oauthId = ?
        `;
        db.run(reactivateQuery, [imageBuffer, googleId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Reactivate associated portfolios
      await new Promise((resolve, reject) => {
        const reactivatePortfoliosQuery = `
          UPDATE portfolios SET deleted = 0 WHERE user_id = ?
        `;
        db.run(reactivatePortfoliosQuery, [userId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Log reactivation
      logAuditAction(
        userId,
        null,
        'REACTIVATE_ACCOUNT',
        null,
        JSON.stringify({ message: 'User account reactivated.' }),
        (auditErr) => {
          if (auditErr) console.warn('Failed to log account reactivation audit:', auditErr.message);
        }
      );
    } else {
      userId = user.id;

      // Update profile picture
      await new Promise((resolve, reject) => {
        updateUserImage(googleId, imageBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Check if 2FA is enabled
      if (user.sfa_enabled) {
        if (otp) {
          // Validate OTP
          const secret = await new Promise((resolve, reject) => {
            getTwoFactorSecret(userId, (err, secret) => {
              if (err || !secret) reject(new Error('No valid 2FA secret found.'));
              else resolve(secret);
            });
          });

          const isValidOtp = authenticator.verify({ token: otp, secret });
          if (!isValidOtp) {
            return res.status(401).json({ error: 'Invalid OTP' });
          }
        } else if (recoveryPhrase) {
          // Validate Recovery Phrase
          const decryptedSeed = await new Promise((resolve, reject) => {
            getTwoFactorRecoverySeed(userId, (err, seed) => {
              if (err || !seed) reject(new Error('No valid recovery phrase found.'));
              else resolve(decrypt(seed));
            });
          });

          if (decryptedSeed !== recoveryPhrase) {
            return res.status(401).json({ error: 'Invalid recovery phrase' });
          }

          // Disable 2FA
          await new Promise((resolve, reject) => {
            disableTwoFactor(userId, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          console.log(`2FA disabled for user ID: ${userId} using recovery phrase.`); 
        } else {
          return res.status(401).json({ error: 'Two-Factor Authentication required' });
        }
      }
    }

    // Generate JWT token
    const token = jwt.sign({ id: userId, email }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error during Google OAuth:', error.message);
    res.status(401).json({ error: 'Invalid Google ID token' });
  }
});



/* for later 
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
*/

/* deprecated since we use oauth only 
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
      updateAuthState(token, user);

      res.json({ token });
    } catch (error) {
      console.error(`Error during login for ${username}:`, error.message);
      clearAuthState();
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});
*/

// Protected Routes
router.post('/refresh-token', authenticateToken, (req, res) => {
  const { id } = req.user;
  const now = Math.floor(Date.now() / 1000);
  const tokenExp = req.user.exp || 0;
  const timeLeft = tokenExp - now;

  if (timeLeft > 5 * 60) {
    // console.log('Token refresh not needed. Time left (seconds):', timeLeft); // DEBUG
    return res.status(400).json({ message: 'Token refresh not needed yet.' });
  }

  const newToken = jwt.sign({ id }, SECRET_KEY, { expiresIn: '15m' });
  // console.log('Token refreshed for user ID:', id); // DEBUG

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
  // console.log('User logged out.'); // DEBUG
  clearAuthState();
  res.status(200).json({ message: 'Logged out successfully.' });
});

module.exports = router;

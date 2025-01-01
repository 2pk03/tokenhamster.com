// middleware/oauthprovider/google.js

const passport = require('passport');
const GoogleLogin = require('passport-google-oauth20').Strategy;
const db = require('../../database');
require('dotenv').config(); // Load environment variables

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Ensure the required environment variables are present
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('Google Client ID and Secret must be defined in .env');
}

passport.use(
  new GoogleLogin(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback', // Update for production and development as needed
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create user in the database
        const email = profile.emails[0].value;
        const user = await findOrCreateUser(profile.displayName, email, profile.id, 'google', profile.photos[0]?.value);
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Helper function to find or create a user
async function findOrCreateUser(username, email, providerId, provider, profilePicture) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
      if (err) return reject(err);
      if (user) return resolve(user);

      // If user doesn't exist, create them
      db.run(
        `INSERT INTO users (username, email, oauthProvider, oauthId, profilePicture) VALUES (?, ?, ?, ?, ?)`,
        [username, email, provider, providerId, profilePicture || null],
        function (insertErr) {
          if (insertErr) return reject(insertErr);
          resolve({ id: this.lastID, username, email });
        }
      );
    });
  });
}

module.exports = passport;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database');

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

// Login
// Login endpoint
router.post('/login', (req, res) => {
    const { username, password } = req.body;
  
    console.log('Login attempt for:', username);
  
    db.getUserByUsername(username, async (err, user) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ error: 'Server error' });
      }
  
      if (!user) {
        console.error('Invalid username:', username);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.error('Password mismatch for user:', username);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
      console.log('Token generated for user ID:', user.id);
  
      res.json({ token });
    });
  });

module.exports = router;

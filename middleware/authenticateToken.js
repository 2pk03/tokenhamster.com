// middleware/authenticateToken.js

const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

const openRoutes = ['/user/auth/google', '/user/auth/google/callback'];

function authenticateToken(req, res, next) {
    if (openRoutes.includes(req.path)) {
        return next(); // Skip token validation for these routes
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error('Access denied: No token provided');
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error('Invalid token:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    });
}

module.exports = authenticateToken;
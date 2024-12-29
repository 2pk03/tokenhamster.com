const jwt = require('jsonwebtoken');
require('dotenv').config(); // Ensure environment variables are loaded

const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    console.log('Authorization Header:', authHeader);
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
        console.log(`Token verified for user ID: ${user.id}`);
        next();
    });
}

module.exports = authenticateToken;

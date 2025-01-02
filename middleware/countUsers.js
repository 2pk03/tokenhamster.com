// middleware/countUsers.js

const activeUsers = new Map(); // In-memory store for active users

// Middleware to track active users
const trackActiveUsers = (req, res, next) => {
    const userId = req.user?.id;
    if (userId) {
        activeUsers.set(userId, Date.now()); // Update or add user's last activity timestamp
    }
    next();
};

// Helper function to fetch active users
const getActiveUsers = () => activeUsers;

// Periodically remove inactive users
setInterval(() => {
    const now = Date.now();
    const activeThreshold = 15 * 60 * 1000; // 15 minutes
    for (const [userId, timestamp] of activeUsers.entries()) {
        if (now - timestamp > activeThreshold) {
            activeUsers.delete(userId); // Remove inactive users
        }
    }
}, 60000); // Cleanup every minute

module.exports = { trackActiveUsers, getActiveUsers };

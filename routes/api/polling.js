const express = require('express');
const { startPollingForUser, stopPollingForUser } = require('../../services/pollingService'); // Adjust path
const router = express.Router();

// Start polling for a user
router.post('/start', (req, res) => {
    const userId = req.user.id;
    startPollingForUser(userId);
    res.json({ message: 'Polling started for your tracked cryptocurrencies.' });
});

// Stop polling for a user
router.post('/stop', (req, res) => {
    const userId = req.user.id;
    stopPollingForUser(userId);
    res.json({ message: 'Polling stopped for your tracked cryptocurrencies.' });
});

module.exports = router;

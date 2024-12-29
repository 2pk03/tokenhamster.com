const express = require('express');
const { db } = require('../../database');
const router = express.Router();

// Fetch user portfolio
router.get('/fetch', (req, res) => {
    const userId = req.user.id;
    const query = `
        SELECT 
            uc.crypto_symbol AS symbol, 
            st.full_name AS full_name, 
            uc.purchase_price AS purchasePrice, 
            uc.purchase_currency AS purchaseCurrency, 
            uc.purchase_date AS purchaseDate
        FROM user_cryptos uc
        LEFT JOIN supported_tokens st ON uc.crypto_symbol = st.symbol
        WHERE uc.user_id = ?
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Failed to fetch portfolio:', err.message);
            return res.status(500).json({ error: 'Failed to fetch portfolio' });
        }
        console.log('Fetched portfolio data:', rows);
        res.json(rows);
    });
});

// Add a token to portfolio
router.post('/add', (req, res) => {
    const userId = req.user.id;
    const { symbol, purchasePrice, purchaseCurrency, purchaseDate } = req.body;

    if (!symbol || !purchasePrice || !purchaseCurrency || !purchaseDate) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = `
        INSERT INTO user_cryptos (user_id, crypto_symbol, purchase_price, purchase_currency, purchase_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(query, [userId, symbol, purchasePrice, purchaseCurrency, purchaseDate], (err) => {
        if (err) {
            console.error('Failed to add token:', err.message);
            return res.status(500).json({ error: 'Failed to add token' });
        }
        res.json({ message: 'Token added successfully.' });
    });
});

// Remove a token from portfolio
router.post('/remove', (req, res) => {
    const userId = req.user.id; // Already set by authenticateToken in the loader
    const { symbol } = req.body;

    if (!symbol) {
        console.error('Symbol is missing from the request body.');
        return res.status(400).json({ error: 'Symbol is required.' });
    }

    console.log(`Removing token ${symbol} from user ID: ${userId}`);
    db.run(
        `DELETE FROM user_cryptos WHERE user_id = ? AND crypto_symbol = ?`,
        [userId, symbol],
        (err) => {
            if (err) {
                console.error(`Database error while removing token ${symbol}:`, err.message);
                return res.status(500).json({ error: 'Failed to remove token.' });
            }
            console.log(`Token ${symbol} removed successfully for user ID: ${userId}`);
            res.json({ message: 'Token removed successfully.' });
        }
    );
});

module.exports = router;

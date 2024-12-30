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
            uc.purchase_date AS purchaseDate,
            uc.amount AS amountBought
        FROM user_cryptos uc
        LEFT JOIN supported_tokens st ON uc.crypto_symbol = st.symbol
        WHERE uc.user_id = ?
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('Failed to fetch portfolio:', err.message);
            return res.status(500).json({ error: 'Failed to fetch portfolio' });
        }
        res.json(rows);
    });
});

// Add a token to portfolio
const { addTokenToPolling } = require('../../services/pollingService');

router.post('/add', async (req, res) => {
    const userId = req.user.id;
    const { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount } = req.body;

    if (!symbol || !purchasePrice || !purchaseCurrency || !purchaseDate || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = `
        INSERT INTO user_cryptos (user_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [userId, symbol, purchasePrice, purchaseCurrency, purchaseDate, amount], async (err) => {
        if (err) {
            console.error('Failed to add token:', err.message);
            return res.status(500).json({ error: 'Failed to add token' });
        }

        try {
            // Add the token to the polling service
            await addTokenToPolling(symbol, purchaseCurrency);

            // Send a success response after adding the token to polling
            res.json({ message: 'Token added successfully and polling updated.' });
        } catch (pollingError) {
            console.error('Failed to update polling for new token:', pollingError.message);
            // Return partial success since the token is added, but polling update failed
            res.status(500).json({
                message: 'Token added successfully, but failed to update polling. Please try again.',
            });
        }
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

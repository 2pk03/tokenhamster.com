// routes/api/functional/price.js

const express = require('express');
const { db } = require('../../../database');
const router = express.Router();

// Fetch current price data for a cryptocurrency
router.get('/current', async (req, res) => {
    const { cryptoSymbol, currency } = req.query;

    try {
        // If cryptoSymbol and currency are provided, fetch specific data
        if (cryptoSymbol && currency) {
            const query = `
                SELECT price, last_updated AS lastUpdated
                FROM current_prices
                WHERE crypto_symbol = ? AND currency = ?
            `;
            db.get(query, [cryptoSymbol, currency], (err, row) => {
                if (err) {
                    console.error('Error fetching current price:', err.message);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                if (!row) {
                    return res.status(404).json({ error: 'Price data not found.' });
                }

                res.json(row);
            });
        } else {
            // Fetch the most recent last_updated timestamp across all tokens
            const query = `
                SELECT MAX(last_updated) AS lastUpdated
                FROM current_prices
            `;
            db.get(query, [], (err, row) => {
                if (err) {
                    console.error('Error fetching last poll timestamp:', err.message);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                if (!row || !row.lastUpdated) {
                    return res.status(404).json({ error: 'No price data found.' });
                }

                res.json({ lastUpdated: row.lastUpdated });
            });
        }
    } catch (error) {
        console.error('Error fetching current prices:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Conversion endpoint (still uses CryptoCompare API if needed)
router.get('/convert', async (req, res) => {
    const { from, to, amount } = req.query;

    if (!from || !to || !amount) {
        return res.status(400).json({ error: 'Missing required query parameters: from, to, amount' });
    }

    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/price`, {
            params: {
                fsym: from,
                tsyms: to,
                api_key: process.env.API_KEY_CRYPTOCOMPARE, // Ensure API key is properly set
            },
        });

        const conversionRate = response.data[to];
        if (!conversionRate) {
            return res.status(404).json({ error: `Conversion rate from ${from} to ${to} not found` });
        }

        const convertedAmount = parseFloat(amount) * conversionRate;
        res.json({
            from,
            to,
            amount,
            conversionRate,
            convertedAmount,
        });
    } catch (err) {
        console.error('Error fetching conversion rate:', err.message);
        res.status(500).json({ error: 'Failed to fetch conversion rate' });
    }
});

module.exports = router;

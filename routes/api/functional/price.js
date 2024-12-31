const express = require('express');
const { db } = require('../../../database');
const router = express.Router();

// Fetch current price data for a cryptocurrency
router.get('/current', (req, res) => {
    const { cryptoSymbol, currency = 'USD' } = req.query;

    if (!cryptoSymbol || !currency) {
        return res.status(400).json({ error: 'cryptoSymbol and currency are required' });
    }

    const query = `
        SELECT price, last_updated
        FROM current_prices
        WHERE crypto_symbol = ? AND currency = ?
    `;

    db.get(query, [cryptoSymbol, currency], (err, row) => {
        if (err) {
            console.error('Error fetching price from database:', err.message);
            return res.status(500).json({ error: 'Failed to fetch price from database' });
        }

        if (!row) {
            return res.status(404).json({ error: `Price data not found for ${cryptoSymbol} in ${currency}` });
        }

        res.json({
            symbol: cryptoSymbol,
            currency,
            price: row.price,
            lastUpdated: row.last_updated,
        });
    });
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

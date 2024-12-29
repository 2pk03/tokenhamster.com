const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { db } = require('../../database');
const router = express.Router();
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../../config');
const { saveOrUpdateCurrentPrice } = require('../../database');


// Fetch current price data for a cryptocurrency
router.get('/current', async (req, res) => {
    const { cryptoSymbol, currency = 'USD' } = req.query;

    if (!cryptoSymbol || !currency) {
        return res.status(400).json({ error: 'cryptoSymbol and currency are required' });
    }

    console.log(`Fetching current price data for: ${cryptoSymbol} in ${currency}`);

    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
            params: {
                fsyms: cryptoSymbol,
                tsyms: currency,
                api_key: API_KEY_CRYPTOCOMPARE
            }
        });

        const price = response.data?.RAW?.[cryptoSymbol]?.[currency]?.PRICE;

        if (price === undefined) {
            return res.status(404).json({ error: `Price data not found for ${cryptoSymbol} in ${currency}` });
        }

        // Save price to the database
        saveOrUpdateCurrentPrice(cryptoSymbol, currency, price, (err) => {
            if (err) {
                console.error(`Failed to save current price for ${cryptoSymbol}:`, err.message);
            }
        });

        res.json({ symbol: cryptoSymbol, currency, price });
    } catch (err) {
        console.error(`Failed to fetch current price data for ${cryptoSymbol}: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch current price data' });
    }
});

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
                api_key: API_KEY_CRYPTOCOMPARE,
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

// routes/api/functional/mcd.js

const express = require('express');
const { db } = require('../../../database');
const router = express.Router();

// Fetch Market Cap Data
router.get('/', (req, res) => {
    const view = req.query.view || 'daily'; // Default to daily
    const interval = view === 'daily' ? 'day' : view === 'weekly' ? 'week' : 'month';

    const sqlQuery = `
        SELECT
            crypto_symbol,
            date(date_time, 'start of ${interval}') AS period,
            AVG(market_cap_usd) AS avg_market_cap
        FROM market_dominance
        WHERE date_time >= date('now', '-1 year') -- Fetch last year's data
        GROUP BY crypto_symbol, period
        ORDER BY period ASC;
    `;

    console.log('Executing SQL Query:', sqlQuery); // Debug log

    db.all(sqlQuery, [], (err, rows) => {
        if (err) {
            console.error('Database error while fetching market cap data:', err.message);
            return res.status(500).json({ error: 'Failed to fetch market cap data' });
        }
        res.json(rows);
    });
});

module.exports = router;
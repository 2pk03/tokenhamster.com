// routes/api/functional/historical.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../../database');

router.get('/tokens', async (req, res) => {
    const query = `
        SELECT DISTINCT crypto_symbol FROM historical_data ORDER BY crypto_symbol;
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching token list:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({
            total_count: rows.length,
            data: rows.map(row => row.crypto_symbol),
        });
    });
}); 

router.get('/:crypto_symbol', async (req, res) => {
    const { crypto_symbol } = req.params;
    const { fields } = req.query;

    const validFields = ['date_time', 'open', 'high', 'low', 'volume_from', 'volume_to', 'market_cap'];

    // If fields are provided, filter and validate them; otherwise, default to all valid fields
    const selectedFields = fields ? fields.split(',') : validFields;
    const sanitizedFields = selectedFields.filter(field => validFields.includes(field));

    if (sanitizedFields.length === 0) {
        return res.status(400).json({ error: 'No valid fields specified.' });
    }

    const query = `
        SELECT ${sanitizedFields.map(field => `COALESCE(${field}, NULL) AS ${field}`).join(', ')}
        FROM historical_data
        WHERE crypto_symbol = ?
          AND date_time >= DATETIME('now', '-30 days')
        ORDER BY date_time ASC;
    `;

    db.all(query, [crypto_symbol], (err, rows) => {
        if (err) {
            console.error(`Error fetching historical data for ${crypto_symbol}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({
            total_count: rows.length,
            data: rows,
        });
    });
});
  
router.get('/:crypto_symbol/aggregated', async (req, res) => {
  const { crypto_symbol } = req.params;
  const { interval, start_date, end_date } = req.query;

  if (!interval || !['hour', 'day'].includes(interval)) {
      return res.status(400).json({ error: 'Invalid interval. Use "hour" or "day".' });
  }

  let query = `
      SELECT 
          crypto_symbol,
          strftime('${interval === 'day' ? '%Y-%m-%d' : '%Y-%m-%d %H:00'}', date_time) AS period,
          AVG(price_usd) AS avg_price_usd,
          AVG(price_eur) AS avg_price_eur,
          AVG(price_btc) AS avg_price_btc,
          AVG(market_cap) AS avg_market_cap,
          SUM(volume_from) AS total_volume_from,
          SUM(volume_to) AS total_volume_to
      FROM historical_data
      WHERE crypto_symbol = ?
  `;
  const params = [crypto_symbol];

  if (start_date) {
      query += ' AND date_time >= ?';
      params.push(start_date);
  }

  if (end_date) {
      query += ' AND date_time <= ?';
      params.push(end_date);
  }

  query += ' GROUP BY period ORDER BY period ASC';

  db.all(query, params, (err, rows) => {
      if (err) {
          console.error(`Error fetching aggregated data for ${crypto_symbol}:`, err.message);
          return res.status(500).json({ error: 'Internal server error' });
      }

      res.json(rows);
  });
});

module.exports = router;

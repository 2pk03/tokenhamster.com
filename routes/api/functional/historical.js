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

// Main endpoint for fetching historical data
router.get('/:crypto_symbol', async (req, res) => {
  const { crypto_symbol } = req.params;
  const { fields, start_date, end_date } = req.query;

  try {
    // Build dynamic field selection for SQL
    const selectedFields = fields
      ? fields
        .split(',')
        .map(field =>
          // Apply COALESCE only to specific fields
          ['price_usd', 'price_btc', 'price_eur'].includes(field)
            ? `COALESCE(${field}, 10) AS ${field}`
            : field // Leave fields like 'volume_to' unchanged
        )
        .join(', ')
      : '*';

    let query = `
          SELECT ${selectedFields}
          FROM historical_data
          WHERE crypto_symbol = ?
      `;

    const queryParams = [crypto_symbol];

    if (start_date) {
      query += ' AND date_time >= ?';
      queryParams.push(start_date);
    }
    if (end_date) {
      query += ' AND date_time <= ?';
      queryParams.push(end_date);
    }

    query += ' ORDER BY date_time ASC';

    db.all(query, queryParams, (err, rows) => {
      if (err) {
        console.error('Error fetching historical data:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({
        total_count: rows.length,
        data: rows,
      });
    });
  } catch (error) {
    console.error('Error in historical data endpoint:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoints for 24h, week, and month
const timeWindows = {
  '24h': '-1 day',
  'week': '-7 days',
  'month': '-30 days',
};

Object.keys(timeWindows).forEach(window => {
  router.get(`/:crypto_symbol/${window}`, async (req, res) => {
    const { crypto_symbol } = req.params;
    const { fields } = req.query;

    try {
      // Build dynamic field selection for SQL
      const selectedFields = fields
        ? fields
          .split(',')
          .map(field =>
            ['price_usd', 'price_btc', 'price_eur'].includes(field)
              ? `COALESCE(${field}, 10) AS ${field}`
              : field // Leave fields like 'volume_to' unchanged
          )
          .join(', ')
        : '*';

      const query = `
              SELECT ${selectedFields}
              FROM historical_data
              WHERE crypto_symbol = ?
                AND date_time >= DATETIME('now', '${timeWindows[window]}')
              ORDER BY date_time ASC
          `;

      db.all(query, [crypto_symbol], (err, rows) => {
        if (err) {
          console.error(`Error fetching ${window} data:`, err.message);
          return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({
          total_count: rows.length,
          data: rows,
        });
      });
    } catch (error) {
      console.error(`Error in ${window} data endpoint:`, error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

router.get('/:crypto_symbol/cs', async (req, res) => {
  const { crypto_symbol } = req.params;
  const { time = '15', start_date, end_date } = req.query;

  const intervalFormats = {
    '15': '%Y-%m-%d %H:%M', // 15-minute intervals
    '30': '%Y-%m-%d %H:%M', // 30-minute intervals
    '60': '%Y-%m-%d %H:00', // Hourly intervals
    '4h': '%Y-%m-%d %H:00', // 4-hour intervals (manual rounding below)
    'day': '%Y-%m-%d',      // Daily intervals
  };

  const intervalFormat = intervalFormats[time];
  if (!intervalFormat) {
    return res.status(400).json({ error: 'Invalid time interval provided' });
  }

  const intervalGroupBy = time === '4h'
    ? `strftime('%Y-%m-%d %H:00', datetime((strftime('%s', date_time) / 14400) * 14400, 'unixepoch'))` // 4-hour grouping
    : `strftime('${intervalFormat}', date_time)`; // Default grouping for other intervals

  const query = `
    WITH aggregated_data AS (
        SELECT
            crypto_symbol,
            ${intervalGroupBy} AS period,
            MIN(date_time) AS min_date_time,
            MAX(date_time) AS max_date_time,
            MAX(price_usd) AS high,
            MIN(price_usd) AS low,
            SUM(volume_to) AS total_volume
        FROM historical_data
        WHERE crypto_symbol = ?
          AND date_time >= ?
          AND date_time <= ?
        GROUP BY period
    ),
    open_close_data AS (
        SELECT
            ad.crypto_symbol,
            ad.period,
            (SELECT price_usd FROM historical_data WHERE crypto_symbol = ad.crypto_symbol AND date_time = ad.min_date_time) AS open,
            (SELECT price_usd FROM historical_data WHERE crypto_symbol = ad.crypto_symbol AND date_time = ad.max_date_time) AS close
        FROM aggregated_data ad
    )
    SELECT
        a.crypto_symbol,
        a.period,
        o.open,
        a.high,
        a.low,
        o.close,
        a.total_volume
    FROM aggregated_data a
    JOIN open_close_data o
    ON a.crypto_symbol = o.crypto_symbol AND a.period = o.period
    ORDER BY a.period;
`;

  db.all(query, [crypto_symbol, start_date, end_date], (err, rows) => {
    if (err) {
      console.error(`Error fetching candlestick data for ${crypto_symbol}:`, err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json(rows);
  });
});

module.exports = router;

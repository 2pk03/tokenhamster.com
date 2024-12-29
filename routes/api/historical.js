const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../database');
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../../config');

router.get('/fetch', async (req, res) => {
    const { symbol } = req.query;
  
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
  
    const checkQuery = `
      SELECT COUNT(*) AS count
      FROM historical_data
      WHERE crypto_symbol = ?
    `;
  
    db.get(checkQuery, [symbol], async (err, row) => {
      if (err) {
        console.error(`Error checking historical data for ${symbol}:`, err.message);
        return res.status(500).json({ error: 'Error checking historical data' });
      }
  
      if (row.count > 0) {
        return res.json({ message: `Historical data already exists for ${symbol}` });
      }
  
      let allHistoricalData = [];
      let hasMoreData = true;
      let toTs = Math.floor(Date.now() / 1000); // Start with current timestamp
  
      try {
        while (hasMoreData) {
          console.log(`Fetching historical data for ${symbol} until timestamp: ${toTs}`);
          const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
            params: {
              fsym: symbol,
              tsym: 'USD',
              limit: 2000, // Maximum limit
              toTs,
              api_key: API_KEY_CRYPTOCOMPARE,
            },
          });
  
          const historicalData = response.data.Data.Data;
  
          // Check if valid data is returned
          if (!historicalData || historicalData.length === 0) {
            console.log(`No more data available for ${symbol}. Stopping.`);
            hasMoreData = false;
            break;
          }
  
          allHistoricalData = allHistoricalData.concat(historicalData);
  
          // Update `toTs` to the earliest timestamp in the batch - 1 second
          const oldestTimestamp = historicalData[0].time;
  
          if (oldestTimestamp <= 0) {
            console.log(`Reached the oldest possible timestamp for ${symbol}. Stopping.`);
            hasMoreData = false;
            break;
          }
  
          toTs = oldestTimestamp - 1;
  
          // Break if the response contains less than the limit, indicating no more data
          if (historicalData.length < 2000) {
            console.log(`Fetched less than 2000 entries for ${symbol}. Assuming no more data.`);
            hasMoreData = false;
          }
        }
  
        // Save all historical data to the database
        const insertQuery = `
          INSERT INTO historical_data (crypto_symbol, date_time, price_usd, volume, market_cap)
          VALUES (?, ?, ?, ?, ?)
        `;
        const stmt = db.prepare(insertQuery);
  
        allHistoricalData.forEach((entry) => {
          const date = new Date(entry.time * 1000).toISOString();
          stmt.run([symbol, date, entry.close, entry.volumeto, entry.mktcap]);
        });
  
        stmt.finalize((finalizeErr) => {
          if (finalizeErr) {
            console.error(`Error saving historical data for ${symbol}:`, finalizeErr.message);
            return res.status(500).json({ error: 'Error saving historical data' });
          }
          console.log(`Complete historical data saved for ${symbol}`);
          res.json({ message: `Complete historical data saved for ${symbol}` });
        });
      } catch (err) {
        console.error(`Error fetching complete historical data for ${symbol}:`, err.message);
        res.status(500).json({ error: 'Error fetching complete historical data' });
      }
    });
  });
  

module.exports = router;

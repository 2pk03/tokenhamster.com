const axios = require('axios');
const { db } = require('../database');
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../config');

const pollingIntervals = {};

// Fetch crypto price data
async function fetchCryptoPrice(cryptoSymbol) {
    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
            params: {
                fsyms: cryptoSymbol,
                tsyms: 'USD',
                api_key: API_KEY_CRYPTOCOMPARE,
            },
        });
        const priceData = response.data.RAW[cryptoSymbol]?.USD || null;
        if (priceData) {
            return {
                crypto_symbol: cryptoSymbol,
                price_usd: priceData.PRICE,
                volume: priceData.VOLUME24HOUR,
                market_cap: priceData.MKTCAP,
                timestamp: new Date().toISOString(),
            };
        }
        return null;
    } catch (err) {
        console.error(`Error fetching price for ${cryptoSymbol}:`, err.message);
        return null;
    }
}

// Save polled data into the database
function savePolledData({ crypto_symbol, price_usd, volume, market_cap, timestamp }) {
    const query = `
        INSERT INTO historical_data (crypto_symbol, date_time, price_usd, volume, market_cap)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [crypto_symbol, timestamp, price_usd, volume, market_cap], (err) => {
        if (err) {
            console.error(`Error saving polled data for ${crypto_symbol}:`, err.message);
        } else {
            console.log(`Polled data saved for ${crypto_symbol}`);
        }
    });
}

// Fetch and save historical data if missing
async function fetchAndSaveHistoricalData(cryptoSymbol) {
    console.log(`Triggering historical data fetch for ${cryptoSymbol}`);

    const query = `
        SELECT MAX(date_time) AS last_date
        FROM historical_data
        WHERE crypto_symbol = ?
    `;
    db.get(query, [cryptoSymbol], async (err, row) => {
        if (err) {
            console.error(`Error checking historical data for ${cryptoSymbol}:`, err.message);
            return;
        }

        const lastDate = row?.last_date ? new Date(row.last_date) : null;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (!lastDate || lastDate < sevenDaysAgo) {
            console.log(`No recent historical data for ${cryptoSymbol}, fetching from CryptoCompare.`);
            try {
                const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
                    params: {
                        fsym: cryptoSymbol,
                        tsym: 'USD',
                        limit: 7,
                        api_key: API_KEY_CRYPTOCOMPARE,
                    },
                });

                const historicalData = response.data.Data.Data;
                console.log(`Fetched historical data for ${cryptoSymbol}:`, historicalData);

                if (!historicalData || !historicalData.length) {
                    console.error(`No historical data returned for ${cryptoSymbol}`);
                    return;
                }

                const insertQuery = `
                    INSERT INTO historical_data (crypto_symbol, date_time, price_usd, volume, market_cap)
                    VALUES (?, ?, ?, ?, ?)
                `;

                const stmt = db.prepare(insertQuery);
                historicalData.forEach((entry) => {
                    const date = new Date(entry.time * 1000).toISOString();
                    stmt.run([cryptoSymbol, date, entry.close, entry.volumeto, entry.mktcap]);
                });
                stmt.finalize((finalizeErr) => {
                    if (finalizeErr) {
                        console.error(`Error saving historical data for ${cryptoSymbol}:`, finalizeErr.message);
                    } else {
                        console.log(`Historical data saved for ${cryptoSymbol}`);
                    }
                });
            } catch (err) {
                console.error(`Error fetching historical data for ${cryptoSymbol}:`, err.message);
            }
        } else {
            console.log(`Historical data for ${cryptoSymbol} is already up-to-date.`);
        }
    });
}

// Start polling for all tracked cryptos
function startPolling() {
    console.log('Starting polling service...');
    db.all(`SELECT DISTINCT crypto_symbol FROM user_cryptos`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching tracked cryptos for polling:', err.message);
            return;
        }

        rows.forEach(({ crypto_symbol }) => {
            // Fetch historical data if necessary
            fetchAndSaveHistoricalData(crypto_symbol);

            // Start polling for current price
            if (pollingIntervals[crypto_symbol]) {
                clearInterval(pollingIntervals[crypto_symbol]);
            }

            pollingIntervals[crypto_symbol] = setInterval(async () => {
                const data = await fetchCryptoPrice(crypto_symbol);
                if (data) {
                    savePolledData(data);
                }
            }, 5 * 60 * 1000); // Poll every 5 minutes
        });
    });
}

// Stop polling for all cryptos
function stopPolling() {
    console.log('Stopping all polling intervals...');
    Object.keys(pollingIntervals).forEach((cryptoSymbol) => {
        clearInterval(pollingIntervals[cryptoSymbol]);
        delete pollingIntervals[cryptoSymbol];
    });
}

module.exports = {
    startPolling,
    stopPolling,
};

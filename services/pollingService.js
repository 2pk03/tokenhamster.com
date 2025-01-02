// services/pollingService.js

const axios = require('axios');
const { db } = require('../database');
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../config');

const pollingIntervals = {};
const DEFAULT_POLLING_INTERVAL = 5 * 60 * 1000; // Default: 5 minutes

// Fetch crypto price data
async function fetchCryptoPrice(cryptoSymbol, currency = 'USD') {
    try {
        console.log(`Fetching price for ${cryptoSymbol} in ${currency}...`);
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
            params: {
                fsyms: cryptoSymbol,
                tsyms: currency,
                api_key: API_KEY_CRYPTOCOMPARE,
            },
        });
        const priceData = response.data.RAW[cryptoSymbol]?.[currency] || null;

        if (priceData) {
            console.log(`Price data for ${cryptoSymbol} (${currency}):`, priceData);
            return {
                crypto_symbol: cryptoSymbol,
                currency,
                price: priceData.PRICE,
                volume: priceData.VOLUME24HOUR,
                market_cap: priceData.MKTCAP,
                timestamp: new Date().toISOString(),
            };
        }

        console.warn(`No price data available for ${cryptoSymbol} (${currency})`);
        return null;
    } catch (err) {
        console.error(`Error fetching price for ${cryptoSymbol} (${currency}):`, err.message);
        return null;
    }
}

// Save polled data into the database
function savePolledData({ crypto_symbol, currency, price, timestamp }) {
    console.log(`Attempting to save data for ${crypto_symbol} (${currency}):`, { price, timestamp });

    const query = `
        INSERT INTO current_prices (crypto_symbol, currency, price, last_updated)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT (crypto_symbol, currency) DO UPDATE SET
        price = excluded.price,
        last_updated = excluded.last_updated
    `;
    db.run(query, [crypto_symbol, currency, price], (err) => {
        if (err) {
            console.error(`Error saving polled data for ${crypto_symbol} (${currency}):`, err.message);
        } else {
            console.log(`Saved polled data for ${crypto_symbol} (${currency})`);
        }
    });
}

// Fetch symbols and currencies from the database
const getTrackedSymbolsAndCurrencies = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT DISTINCT uc.crypto_symbol, uc.purchase_currency
            FROM user_cryptos uc
            INNER JOIN portfolios p ON uc.portfolio_id = p.id
            WHERE p.name = 'Default Portfolio'
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(
                    rows.map(row => ({
                        crypto_symbol: row.crypto_symbol,
                        currency: row.purchase_currency,
                    }))
                );
            }
        });
    });
};


// Poll prices for all symbols and currencies
async function pollPricesForSymbolsAndCurrencies() {
    try {
        const trackedPairs = await getTrackedSymbolsAndCurrencies();
        const uniquePairs = [
            ...new Map(
                trackedPairs.map(pair => [
                    `${pair.crypto_symbol}-${pair.currency}`,
                    pair,
                ])
            ).values(),
        ];

        console.log("Polling unique pairs:", uniquePairs);

        for (const { crypto_symbol, currency } of uniquePairs) {
            const data = await fetchCryptoPrice(crypto_symbol, currency);
            if (data) {
                savePolledData(data);
            }
        }
    } catch (err) {
        console.error('Error polling prices:', err.message);
    }
}

// Dynamically add a new token to polling
async function addTokenToPolling(cryptoSymbol, currency) {
    const pollingKey = `${cryptoSymbol}-${currency}`;
    if (pollingIntervals[pollingKey]) {
        console.log(`Polling already active for ${cryptoSymbol} (${currency}).`);
        return;
    }

    console.log(`Adding ${cryptoSymbol} (${currency}) to polling.`);
    fetchAndSaveHistoricalData(cryptoSymbol); // Ensure historical data is fetched.

    pollingIntervals[pollingKey] = setInterval(async () => {
        console.log(`Polling for ${cryptoSymbol} in ${currency}...`);
        const data = await fetchCryptoPrice(cryptoSymbol, currency);
        if (data) {
            console.log(`Fetched valid data for ${cryptoSymbol} (${currency}):`, data);
            savePolledData(data);
        } else {
            console.warn(`No valid data received for ${cryptoSymbol} (${currency})`);
        }
    }, DEFAULT_POLLING_INTERVAL);

    console.log(`Polling interval set for ${cryptoSymbol} (${currency}).`);
}

// Fetch and save historical data if missing
async function fetchAndSaveHistoricalData(cryptoSymbol) {
    console.log(`Triggering historical data fetch for ${cryptoSymbol}`);

    // Verify if the token belongs to the default portfolio
    const portfolioCheckQuery = `
        SELECT 1
        FROM user_cryptos uc
        INNER JOIN portfolios p ON uc.portfolio_id = p.id
        WHERE p.name = 'Default Portfolio' AND uc.crypto_symbol = ?
    `;

    db.get(portfolioCheckQuery, [cryptoSymbol], async (err, row) => {
        if (err) {
            console.error(`Error checking portfolio for ${cryptoSymbol}:`, err.message);
            return;
        }

        if (!row) {
            console.log(`Skipping historical data fetch: ${cryptoSymbol} is not in the default portfolio.`);
            return;
        }

        // Proceed to fetch historical data
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

                    if (!historicalData || !historicalData.length) {
                        console.error(`No historical data returned for ${cryptoSymbol}`);
                        return;
                    }

                    const insertQuery = `
                        INSERT INTO historical_data (crypto_symbol, date_time, price_usd, volume, market_cap)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (crypto_symbol, date_time) DO UPDATE SET
                        price_usd = excluded.price_usd,
                        volume = excluded.volume,
                        market_cap = excluded.market_cap
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
    });
}

// Start polling for all active cryptos and currencies
function startPolling() {
    console.log('Starting polling service...');

    db.all(`SELECT DISTINCT crypto_symbol, purchase_currency FROM user_cryptos`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching active cryptos for polling:', err.message);
            return;
        }

        if (rows.length === 0) {
            console.warn('No cryptos found to poll. Adding placeholder tokens for BTC/USD.');
            // Add a placeholder token to ensure polling starts
            addTokenToPolling('BTC', 'USD');
            return;
        }

        console.log('Fetched cryptos for polling:', rows);

        // Start polling for each unique token-currency pair
        rows.forEach(({ crypto_symbol, purchase_currency }) => {
            addTokenToPolling(crypto_symbol, purchase_currency);
        });
    });
}

// Stop polling for all cryptos and currencies
function stopPolling() {
    console.log('Stopping all polling intervals...');
    Object.keys(pollingIntervals).forEach((pollingKey) => {
        clearInterval(pollingIntervals[pollingKey]);
        delete pollingIntervals[pollingKey];
    });
}

module.exports = {
    startPolling,
    stopPolling,
    addTokenToPolling, // Expose to allow dynamic additions
};
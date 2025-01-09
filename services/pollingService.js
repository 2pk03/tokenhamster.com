// services/pollingService.js

const axios = require('axios');
const { db, calculateAndSavePortfolioValues, getAllActiveUserIds } = require('../database');
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../config');
const { broadcast } = require("../middleware/eventbus/express");

const pollingIntervals = {};
const DEV_POLLING_INTERVAL = 60 * 60 * 1000;
const PROD_POLLING_INTERVAL = 7.5 * 60 * 1000;
const DEFAULT_POLLING_INTERVAL = process.env.DEV === '1' ? DEV_POLLING_INTERVAL : PROD_POLLING_INTERVAL;

/* 
// Add an interceptor for requests - DEBUG - NOT FOR PROD - EXPOSES KEYS
axios.interceptors.request.use(
    function (config) {
        // Log the full API call details
        console.log('API Request:', {
            method: config.method,
            url: config.url,
            params: config.params,
            data: config.data,
            headers: config.headers
        });

        return config;
    },
    function (error) {
        // Do something with request error
        console.error('Request Error:', error);
        return Promise.reject(error);
    }
); */

// Fetch crypto price data
async function fetchCryptoPrices(fsyms, tsyms) {
    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemulti`, {
            params: { fsyms, tsyms, api_key: API_KEY_CRYPTOCOMPARE },
        });
        // console.log('API Response:', JSON.stringify(response.data, null, 2)); // Debug
        return response.data;
    } catch (err) {
        console.error(`Error fetching prices for fsyms=[${fsyms}] and tsyms=[${tsyms}]:`, err.message);
        return null;
    }
}

// Save polled data into the database
function savePolledData({ crypto_symbol, timestamp, prices }) {
    if (!prices || typeof prices !== 'object') {
        console.error(`Invalid prices data for ${crypto_symbol}. Skipping database update.`);
        return;
    }

    const { EUR, USD, BTC } = prices;

    const updateQuery = `
        INSERT INTO current_prices (crypto_symbol, currency, price, last_updated)
        VALUES (?, 'EUR', ?, ?),
               (?, 'USD', ?, ?),
               (?, 'BTC', ?, ?)
        ON CONFLICT (crypto_symbol, currency) DO UPDATE SET
        price = excluded.price,
        last_updated = excluded.last_updated;
    `;

    db.run(
        updateQuery,
        [crypto_symbol, EUR, timestamp, crypto_symbol, USD, timestamp, crypto_symbol, BTC, timestamp],
        (err) => {
            if (err) {
                console.error(`Error saving to current_prices for ${crypto_symbol}:`, err.message);
            } else {
                console.log(`Saved current prices for ${crypto_symbol}.`);
            }
        }
    );

    const historicalQuery = `
        INSERT INTO historical_data (crypto_symbol, date_time, price_usd, price_eur, price_btc)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (crypto_symbol, date_time) DO UPDATE SET
        price_usd = excluded.price_usd,
        price_eur = excluded.price_eur,
        price_btc = excluded.price_btc;
    `;

    db.run(
        historicalQuery,
        [crypto_symbol, timestamp, USD, EUR, BTC],
        (err) => {
            if (err) {
                console.error(`Error saving to historical_data for ${crypto_symbol}:`, err.message);
            } else {
                console.log(`Saved historical data for ${crypto_symbol}.`);
            }
        }
    );
}

// Fetch symbols and currencies from the database
const getTrackedSymbolsAndCurrencies = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT DISTINCT uc.crypto_symbol, uc.purchase_currency
            FROM user_cryptos uc
            INNER JOIN portfolios p ON uc.portfolio_id = p.id
            WHERE p.user_id = uc.user_id AND p.deleted = 0
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

async function pollPricesForActiveTokens() {
    try {
        const activeTokens = await getTrackedSymbolsAndCurrencies();
        if (!activeTokens.length) {
            console.warn('No active tokens found for polling.');
            return;
        }

        const batchSize = 100;
        const totalBatches = Math.ceil(activeTokens.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const batchStart = batchIndex * batchSize;
            const batchEnd = batchStart + batchSize;
            const batch = activeTokens.slice(batchStart, batchEnd);

            const fsyms = batch.join(',');
            const tsyms = 'EUR,USD,BTC';

            const response = await fetchCryptoPrices(fsyms, tsyms);
            if (response) {
                // console.log('Fetched prices for batch:', batch); // DEBUG

                // Save individual token data
                Object.entries(response).forEach(([symbol, prices]) => {
                    if (prices && typeof prices === 'object' && 'EUR' in prices && 'USD' in prices && 'BTC' in prices) {
                        savePolledData({
                            crypto_symbol: symbol,
                            timestamp: new Date().toISOString(),
                            prices,
                        });
                    } else {
                        console.warn(`Incomplete data for ${symbol}. Skipping.`);
                    }
                });
            } else {
                console.error(`Failed to fetch price data for batch: ${fsyms}`);
            }
        }
    } catch (err) {
        console.error('Error polling prices for active tokens:', err.message);
    }
}

// Dynamically add a new token to polling
async function addTokenToPolling(cryptoSymbol, currency) {
    const pollingKey = `${cryptoSymbol}-${currency}`;
    if (pollingIntervals[pollingKey]) {
        return; // Skip if already polling
    }

    console.log(`Adding ${cryptoSymbol} (${currency}) to polling.`);

    pollingIntervals[pollingKey] = setInterval(async () => {
        const data = await fetchCryptoPrices(cryptoSymbol, currency);
        if (data && data[cryptoSymbol]) {
            savePolledData({
                crypto_symbol: cryptoSymbol,
                timestamp: new Date().toISOString(),
                prices: data[cryptoSymbol],
            });
        } else {
            console.warn(`No valid data received for ${cryptoSymbol} (${currency}).`);
        }
    }, DEFAULT_POLLING_INTERVAL);

    console.log(`Polling interval set for ${cryptoSymbol} (${currency}) to ${DEFAULT_POLLING_INTERVAL / 1000}s.`);
}

async function fetchAndSaveHistoricalData(cryptoSymbol) {
    console.log(`Triggering historical data fetch for ${cryptoSymbol}`);

    // Verify if the token belongs to an active portfolio
    const portfolioCheckQuery = `
        SELECT 1
        FROM user_cryptos uc
        INNER JOIN portfolios p ON uc.portfolio_id = p.id
        WHERE p.user_id = uc.user_id AND p.deleted = 0 AND uc.crypto_symbol = ?
    `;

    db.get(portfolioCheckQuery, [cryptoSymbol], async (err, row) => {
        if (err) {
            console.error(`Error checking portfolio for ${cryptoSymbol}:`, err.message);
            return;
        }

        if (!row) {
            console.log(`Skipping historical data fetch: ${cryptoSymbol} is not in an active portfolio.`);
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

const refreshPolling = async () => {
    try {
        const trackedPairs = await getTrackedSymbolsAndCurrencies();

        if (trackedPairs.length === 0) {
            console.warn('No cryptos found to poll. Adding placeholder BTC/USD.');
            if (!pollingIntervals['BTC-USD']) {
                addTokenToPolling('BTC', 'USD'); // placeholder to start for fresh installs
            }
            return;
        }

        // always track BTC
        const uniqueSymbols = [...new Set(trackedPairs.map(({ crypto_symbol }) => crypto_symbol))];
        if (!uniqueSymbols.includes('BTC')) {
            uniqueSymbols.push('BTC');
        }
        // batch polling grouping
        const batches = [];
        for (let i = 0; i < uniqueSymbols.length; i += 100) {
            batches.push(uniqueSymbols.slice(i, i + 100));
        }

        // Fetch prices for each batch
        for (const batch of batches) {
            const fsyms = batch.join(',');
            const tsyms = 'EUR,USD,BTC';

            const response = await fetchCryptoPrices(fsyms, tsyms);
            if (response) {
                Object.entries(response).forEach(([symbol, prices]) => {
                    if (prices.EUR && prices.USD && prices.BTC) {
                        savePolledData({
                            crypto_symbol: symbol,
                            timestamp: new Date().toISOString(),
                            prices: {
                                EUR: prices.EUR,
                                USD: prices.USD,
                                BTC: prices.BTC,
                            },
                        });
                    } else {
                        console.warn(`Incomplete data for ${symbol}. Skipping.`);
                    }
                });
                    broadcast("dataUpdated"); // Push event to bus
            } else {
                console.error(`Failed to fetch prices for batch: ${fsyms}`);
            }
        }
    } catch (err) {
        console.error('Error refreshing polling tokens:', err.message);
    }
};


// Start polling for all active cryptos and currencies
function startPolling() {
    console.log('Starting polling service...');
    refreshPolling();
    startPortfolioCalculation();

    // final batch polling
    setInterval(refreshPolling, DEFAULT_POLLING_INTERVAL);
}

function startPortfolioCalculation() {
    console.log('Starting portfolio value calculation service...');

    const refreshPortfolioValues = async () => {
        try {
            const userIds = await getAllActiveUserIds();
            for (const userId of userIds) {
                // console.log(`Calculating portfolio values for user ${userId}...`); // DEBUG
                await calculateAndSavePortfolioValues(userId);
            }
        } catch (err) {
            console.error('Error refreshing portfolio values:', err.message);
        }
    };

    // Perform initial portfolio value calculation
    refreshPortfolioValues();

    // Periodic portfolio value calculation
    setInterval(refreshPortfolioValues, DEFAULT_POLLING_INTERVAL);
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
    addTokenToPolling,
    pollPricesForActiveTokens
};
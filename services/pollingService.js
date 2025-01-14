// services/pollingService.js

const axios = require('axios');
const { db, calculateAndSavePortfolioValues, getAllActiveUserIds } = require('../database');
const { API_KEY_CRYPTOCOMPARE, CRYPTOCOMPARE_BASE_URL } = require('../config');
const { broadcast } = require("../middleware/eventbus/express");

const pollingIntervals = {};
const DEV_POLLING_INTERVAL = 30 * 60 * 1000;
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

async function fetchTop10Cryptos() {
    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/top/mktcapfull`, {
            params: { limit: 10, tsym: 'USD', api_key: API_KEY_CRYPTOCOMPARE },
        });

        if (response.data && response.data.Data) {
            return response.data.Data.map(crypto => ({
                symbol: crypto.CoinInfo.Name,
                marketCap: crypto.RAW.USD.MKTCAP, // Always include market cap
            }));
        }

        console.warn('fetchTop10Cryptos: Empty or invalid API response.');
        return [];
    } catch (err) {
        console.error('Error fetching top 10 cryptos:', err.message);
        return [];
    }
}

// Fetch crypto price data
async function fetchCryptoPrices(fsyms, tsyms) {
    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
            params: { fsyms, tsyms, api_key: API_KEY_CRYPTOCOMPARE },
        });
        // console.log('API Response:', JSON.stringify(response.data, null, 2)); // Debug
        return response.data.RAW;;
    } catch (err) {
        console.error(`Error fetching prices for fsyms=[${fsyms}] and tsyms=[${tsyms}]:`, err.message);
        return null;
    }
}

// Get the last poll timestamp for market_cap
function getLastMarketCapPoll() {
    return new Promise((resolve, reject) => {
        const query = `SELECT last_polled FROM market_poll_status ORDER BY id DESC LIMIT 1`;
        db.get(query, [], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row ? new Date(row.last_polled) : null);
            }
        });
    });
}

// Update the last poll timestamp for market_cap
function updateLastMarketCapPoll() {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        const query = `INSERT INTO market_poll_status (last_polled) VALUES (?)`;
        db.run(query, [now], (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function saveMarketCapData({ crypto_symbol, market_cap_usd, dominance_percentage, timestamp }) {
    const query = `
        INSERT INTO market_dominance (crypto_symbol, date_time, market_cap_usd, dominance_percentage)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (crypto_symbol, date_time) DO UPDATE SET
        market_cap_usd = excluded.market_cap_usd,
        dominance_percentage = excluded.dominance_percentage;
    `;

    db.run(query, [crypto_symbol, timestamp, market_cap_usd, dominance_percentage], (err) => {
        if (err) {
            console.error(`Error saving market cap for ${crypto_symbol}:`, err.message);
        } else {
            console.log(`Market cap saved for ${crypto_symbol}: ${market_cap_usd}`);
        }
    });
}

async function fetchGlobalMarketCap() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/global');
        return response.data.data.total_market_cap.usd || 0;
    } catch (err) {
        console.error('Error fetching global market cap:', err.message);
        return 0;
    }
}


// Save polled data into the database
function savePolledData({ crypto_symbol, timestamp, prices }) {
    if (!prices || typeof prices !== 'object') {
        console.error(`Invalid prices data for ${crypto_symbol}. Skipping database update.`);
        return;
    }

    // Extract raw fields from the `prices` object
    const usdData = prices.USD || {};
    const eurData = prices.EUR || {};

    const usdPrice = usdData.PRICE || null;
    const eurPrice = eurData.PRICE || null;
    const btcPrice = prices.BTC?.PRICE || null;

    // Format fields only for historical data
    const open = parseFloat(usdData.OPENHOUR?.toFixed(10)) || null;
    const high = parseFloat(usdData.HIGHHOUR?.toFixed(10)) || null;
    const low = parseFloat(usdData.LOWHOUR?.toFixed(10)) || null;
    const volume_from = parseFloat(usdData.VOLUMEHOUR?.toFixed(10)) || null;
    const volume_to = parseFloat(usdData.VOLUMEHOURTO?.toFixed(10)) || null;
    const market_cap = parseFloat(usdData.MKTCAP?.toFixed(2)) || null;

    
    /*
    // Debug log for verification
    console.log({
        crypto_symbol,
        timestamp,
        price_usd: usdPrice,
        price_eur: eurPrice,
        price_btc: btcPrice,
        open,
        high,
        low,
        volume_from,
        volume_to,
        market_cap,
    }); */

    // Save raw data to current_prices
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
        [crypto_symbol, eurPrice, timestamp, crypto_symbol, usdPrice, timestamp, crypto_symbol, btcPrice, timestamp],
        (err) => {
            if (err) {
                console.error(`Error saving to current_prices for ${crypto_symbol}:`, err.message);
            }
        }
    );

    // Save formatted data to historical_data
    const historicalQuery = `
        INSERT INTO historical_data (
            crypto_symbol, date_time, price_usd, price_eur, price_btc, open, high, low, volume_from, volume_to, market_cap
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (crypto_symbol, date_time) DO UPDATE SET
        price_usd = excluded.price_usd,
        price_eur = excluded.price_eur,
        price_btc = excluded.price_btc,
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        volume_from = excluded.volume_from,
        volume_to = excluded.volume_to,
        market_cap = excluded.market_cap;
    `;

    db.run(
        historicalQuery,
        [
            crypto_symbol,
            timestamp,
            usdPrice,
            eurPrice,
            btcPrice,
            open,
            high,
            low,
            volume_from,
            volume_to,
            market_cap,
        ],
        (err) => {
            if (err) {
                console.error(`Error saving to historical_data for ${crypto_symbol}:`, err.message);
            } else {
                // console.log(`Saved historical data for ${crypto_symbol}.`);
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
        // Step 1: Fetch currently tracked tokens
        const activeTokens = await getTrackedSymbolsAndCurrencies();
        const activeSymbols = activeTokens.map(s => s.toUpperCase());

        // console.log('Active tokens from database:', activeSymbols); // DEBUG

        // Step 2: Fetch top 10 cryptos by market cap
        const top10Cryptos = await fetchTop10Cryptos();
        const top10Symbols = top10Cryptos.map(({ symbol }) => symbol.toUpperCase());

        // console.log('Top 10 cryptos fetched from API:', top10Symbols); // DEBUG

        // Step 3: Merge and deduplicate
        const allSymbols = [...new Set([...activeSymbols, ...top10Symbols])];

        // console.log('Final merged list of tokens for polling:', allSymbols); // DEBUG

        if (!allSymbols.length) {
            console.warn('No active tokens found for polling.');
            return;
        }

        // Step 4: Poll in batches
        const batchSize = 100;
        const totalBatches = Math.ceil(allSymbols.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const batch = allSymbols.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

            // console.log(`Polling batch ${batchIndex + 1}/${totalBatches}:`, batch); // DEBUG

            const fsyms = batch.join(',');
            const tsyms = 'EUR,USD,BTC';

            const response = await fetchCryptoPrices(fsyms, tsyms);
            if (response) {
                Object.entries(response).forEach(([symbol, prices]) => {
                    if (prices && prices.USD) {
                        savePolledData({
                            crypto_symbol: symbol,
                            timestamp: new Date().toISOString(),
                            prices,
                        });
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

    // console.log(`Adding ${cryptoSymbol} (${currency}) to polling.`); // DEBUG

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

    // console.log(`Polling interval set for ${cryptoSymbol} (${currency}) to ${DEFAULT_POLLING_INTERVAL / 1000}s.`); // DEBUG
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
        // Step 1: Check if market cap polling is needed
        const lastPollDate = await getLastMarketCapPoll();
        const today = new Date().toISOString().split('T')[0];

        if (lastPollDate && lastPollDate.toISOString().split('T')[0] === today) {
            // console.log('Market cap already polled today. Skipping.'); // DEBUG
        } else {
            // console.log('Polling market cap data...'); // DEBUG
            
            // Step 2: Fetch global market cap
            const globalMarketCap = await fetchGlobalMarketCap();
            if (!globalMarketCap || globalMarketCap <= 0) {
                console.error('Unable to fetch global market cap. Skipping dominance calculation.');
            } else {
                // console.log('Global market cap (USD):', globalMarketCap); // DEBUG

                // Step 3: Fetch the top 10 cryptocurrencies
                const top10Cryptos = await fetchTop10Cryptos();
                const timestamp = new Date().toISOString();

                // Save market cap and dominance percentage for top 10 cryptos
                top10Cryptos.forEach(({ symbol, marketCap }) => {
                    const dominancePercentage = (marketCap / globalMarketCap) * 100;

                    saveMarketCapData({
                        crypto_symbol: symbol,
                        market_cap_usd: marketCap,
                        dominance_percentage: dominancePercentage,
                        timestamp,
                    });
                });

                // Update the last poll timestamp
                await updateLastMarketCapPoll();
            }
        }

        // Proceed with regular polling for tracked tokens
        const trackedPairs = await getTrackedSymbolsAndCurrencies();
        const trackedSymbols = trackedPairs.map(({ crypto_symbol }) => crypto_symbol.toUpperCase());

        // console.log('Tracked tokens from database:', trackedSymbols); // DEBUG

        const batchSize = 100;
        const totalBatches = Math.ceil(trackedSymbols.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const batch = trackedSymbols.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
            // console.log(`Polling batch ${batchIndex + 1}/${totalBatches}:`, batch); // DEBUG

            const fsyms = batch.join(',');
            const tsyms = 'EUR,USD,BTC';

            const response = await fetchCryptoPrices(fsyms, tsyms);
            if (response) {
                Object.entries(response).forEach(([symbol, prices]) => {
                    if (prices && prices.USD) {
                        savePolledData({
                            crypto_symbol: symbol,
                            timestamp: new Date().toISOString(),
                            prices,
                        });
                    }
                });
                broadcast('dataUpdated');
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
    // console.log('Starting portfolio value calculation service...'); // DEBUG

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
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const axios = require('axios');
require('dotenv').config();

const db = new sqlite3.Database('./tracker.db', (err) => {
    if (err) {
        console.error('Failed to connect to the database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Initialize tables with optimizations
function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        // User-Cryptos table
        db.run(`
            CREATE TABLE IF NOT EXISTS user_cryptos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                crypto_symbol TEXT NOT NULL,
                purchase_price REAL,        -- Price at which the token was purchased
                purchase_currency TEXT,     -- Currency used for the purchase
                purchase_date DATE,         -- Date the token was purchased
                amount REAL DEFAULT 0,      -- Amount of crypto purchased
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Historical Data table with index for optimized querying
        db.run(`
            CREATE TABLE IF NOT EXISTS historical_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crypto_symbol TEXT NOT NULL,
                date_time DATETIME NOT NULL,
                price_usd REAL,
                volume REAL,
                market_cap REAL,
                UNIQUE (crypto_symbol, date_time)
            )
        `);


        db.run(`
            CREATE TABLE IF NOT EXISTS current_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crypto_symbol TEXT NOT NULL,
                currency TEXT NOT NULL,
                price REAL NOT NULL,
                last_updated DATETIME NOT NULL,
                UNIQUE(crypto_symbol, currency) -- Ensures one record per symbol and currency
            )
        `);

        // Add index to improve query performance on historical_data table
        db.run(`CREATE INDEX IF NOT EXISTS idx_historical_data ON historical_data (crypto_symbol, date_time);`);

        // Aggregated Data table for pre-computed summaries (daily averages, etc.)
        db.run(`
            CREATE TABLE IF NOT EXISTS aggregated_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crypto_symbol TEXT NOT NULL,
                date DATE NOT NULL,
                avg_price REAL,
                total_volume REAL,
                market_cap REAL
            )
        `);

        // Polling Settings Table
        db.run(`
            CREATE TABLE IF NOT EXISTS user_crypto_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                crypto_symbol TEXT NOT NULL,
                polling_interval INTEGER DEFAULT 60, -- Default to 60 seconds
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Add index to aggregated_data for faster querying
        db.run(`CREATE INDEX IF NOT EXISTS idx_aggregated_data ON aggregated_data (crypto_symbol, date);`);

        // Portfolio table for user-tracked investments
        db.run(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                crypto_symbol TEXT NOT NULL,
                amount REAL NOT NULL,
                purchase_date DATE NOT NULL,
                purchase_price REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // store supported tokens we query from the API
        db.run(`
            CREATE TABLE IF NOT EXISTS supported_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                coin_name TEXT NOT NULL
            )
        `);

        // SQLLite related code
        // Check if 'profilePicture' column exists in 'users' table
        db.all(
            `PRAGMA table_info(users);`,
            (err, rows) => {
                if (err) {
                    console.error('Error checking users table schema:', err.message);
                } else if (!rows.some(col => col.name === 'profilePicture')) {
                    console.log('Adding profilePicture column to users table...');
                    db.run(
                        `ALTER TABLE users ADD COLUMN profilePicture TEXT DEFAULT NULL`,
                        (alterErr) => {
                            if (alterErr) {
                                console.error('Error adding profilePicture column:', alterErr.message);
                            } else {
                                console.log('profilePicture column added successfully.');
                            }
                        }
                    );
                } else {
                    console.log('profilePicture column already exists in users table.');
                }
            }
        );

        // Add admin user
        const adminUsername = 'admin';
        const adminEmail = 'admin@example.com';
        const adminPassword = 'adminpassword';

        db.get(
            `SELECT * FROM users WHERE username = ?`,
            [adminUsername],
            async (err, row) => {
                if (err) {
                    console.error('Error checking for admin user:', err.message);
                } else if (!row) {
                    console.log('Admin user not found. Creating now...');
                    const hashedPassword = await bcrypt.hash(adminPassword, 10);

                    db.run(
                        `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
                        [adminUsername, adminEmail, hashedPassword],
                        function (insertErr) {
                            if (insertErr) {
                                console.error('Failed to insert admin user:', insertErr.message);
                            } else {
                                console.log('Admin user created successfully.');

                                // Automatically add BTC to the admin's portfolio
                                const adminUserId = this.lastID; // Get the ID of the new admin
                                const addCryptoQuery = `
                                    INSERT INTO user_cryptos (user_id, crypto_symbol, purchase_price, purchase_currency, purchase_date)
                                    VALUES (?, ?, ?, ?, ?)
                                `;

                                db.run(addCryptoQuery, [adminUserId, 'BTC', 0, 'USD', '2023-01-01'], (cryptoErr) => {
                                    if (cryptoErr) {
                                        console.error(
                                            `Failed to add BTC to admin portfolio for user ID ${adminUserId}:`,
                                            cryptoErr.message
                                        );
                                    } else {
                                        console.log(`BTC added to admin's portfolio for user ID ${adminUserId}`);
                                    }
                                });
                            }
                        }
                    );
                } else {
                    console.log('Admin user already exists.');
                }
            }
        );
    });
}

// Add a user
function addUser(username, email, password, callback) {
    const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
    db.run(query, [username, email, password], function (err) {
        if (err) {
            return callback(err, null);
        }

        const userId = this.lastID;

        // Automatically add BTC to the new user's portfolio
        const addCryptoQuery = `
            INSERT INTO user_cryptos (user_id, crypto_symbol, purchase_price, purchase_currency, purchase_date)
            VALUES (?, ?, ?, ?, ?)
        `;
        db.run(addCryptoQuery, [userId, 'BTC', 0, 'USD', '2023-01-01'], (cryptoErr) => {
            if (cryptoErr) {
                console.error(`Failed to add BTC to portfolio for user ID ${userId}:`, cryptoErr.message);
            } else {
                console.log(`BTC added to portfolio for user ID ${userId}`);
            }
        });

        callback(null, userId);
    });
}

// Add a crypto to track for a user
function addCrypto(userId, cryptoSymbol, purchasePrice, purchaseCurrency, purchaseDate, amount, callback) {
    const query = `
        INSERT INTO user_cryptos (user_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [userId, cryptoSymbol, purchasePrice, purchaseCurrency, purchaseDate, amount], callback);
}

// Fetch historical data for a crypto
function getHistoricalData(cryptoSymbol, limit, callback) {
    const query = `
        SELECT * FROM historical_data
        WHERE crypto_symbol = ?
        ORDER BY date_time DESC
        LIMIT ?
    `;
    db.all(query, [cryptoSymbol, limit], callback);
}

// Save historical data
function saveHistoricalData(cryptoSymbol, data, callback) {
    const query = `
        INSERT INTO historical_data (crypto_symbol, date_time, price_usd, volume, market_cap)
        VALUES (?, ?, ?, ?, ?)
    `;
    const stmt = db.prepare(query);

    data.forEach((entry) => {
        stmt.run([cryptoSymbol, entry.date_time, entry.price_usd, entry.volume, entry.market_cap]);
    });

    stmt.finalize(callback);
}

// Save aggregated data (e.g., daily averages)
function saveAggregatedData(cryptoSymbol, date, avgPrice, totalVolume, marketCap, callback) {
    const query = `
        INSERT INTO aggregated_data (crypto_symbol, date, avg_price, total_volume, market_cap)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [cryptoSymbol, date, avgPrice, totalVolume, marketCap], callback);
}

// Fetch aggregated data
function getAggregatedData(cryptoSymbol, startDate, endDate, callback) {
    const query = `
        SELECT * FROM aggregated_data
        WHERE crypto_symbol = ? AND date BETWEEN ? AND ?
        ORDER BY date
    `;
    db.all(query, [cryptoSymbol, startDate, endDate], callback);
}
// Fetch a user by username
function getUserByUsername(username, callback) {
    const query = `SELECT * FROM users WHERE username = ?`;
    db.get(query, [username], callback);
}

// Update supported tokens from the API
async function updateSupportedTokens() {
    const apiKey = process.env.API_KEY_CRYPTOCOMPARE;
    if (!apiKey) {
        console.error('API_KEY_CRYPTOCOMPARE is not defined in the .env file.');
        return;
    }

    console.log('Starting update of supported tokens from CryptoCompare API...');
    try {
        const response = await axios.get('https://min-api.cryptocompare.com/data/all/coinlist', {
            params: {
                api_key: apiKey
            }
        });

        const tokens = Object.values(response.data.Data).map(token => ({
            Symbol: token.Symbol,
            FullName: token.FullName,
            CoinName: token.CoinName
        }));

        console.log(`Fetched ${tokens.length} tokens from CryptoCompare.`);

        saveSupportedTokens(tokens, (err) => {
            if (err) {
                console.error('Failed to save supported tokens:', err.message);
            } else {
                console.log('Supported tokens updated successfully in the database.');
            }
        });
    } catch (err) {
        console.error('Failed to fetch supported tokens:', err.message);
    }
}

// Save or update current price for a crypto symbol
function saveOrUpdateCurrentPrice(cryptoSymbol, currency, price, callback) {
    const query = `
        INSERT INTO current_prices (crypto_symbol, currency, price, last_updated)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(crypto_symbol, currency) 
        DO UPDATE SET price = excluded.price, last_updated = excluded.last_updated
    `;
    db.run(query, [cryptoSymbol, currency, price], (err) => {
        if (err) {
            console.error(`Failed to save or update current price for ${cryptoSymbol}:`, err.message);
        }
        if (callback) callback(err);
    });
}

// Fetch current price for a crypto symbol
function getCurrentPrice(cryptoSymbol, currency, callback) {
    const query = `SELECT price, last_updated FROM current_prices WHERE crypto_symbol = ? AND currency = ?`;
    db.get(query, [cryptoSymbol, currency], callback);
}

// Save supported tokens
function saveSupportedTokens(tokens, callback) {
    const query = `INSERT OR IGNORE INTO supported_tokens (symbol, full_name, coin_name) VALUES (?, ?, ?)`;
    const stmt = db.prepare(query);

    tokens.forEach(token => {
        stmt.run([token.Symbol, token.FullName, token.CoinName]);
    });

    stmt.finalize(callback);
}

// Export the function
module.exports = {
    db,
    initializeDatabase,
    addUser,
    addCrypto,
    getHistoricalData,
    saveHistoricalData,
    saveAggregatedData,
    getAggregatedData,
    getUserByUsername,
    updateSupportedTokens,
    saveSupportedTokens,
    saveOrUpdateCurrentPrice
};
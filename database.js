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
        // Users table: Updated for OAuth support
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT DEFAULT NULL,
                oauthProvider TEXT DEFAULT NULL,
                oauthId TEXT UNIQUE DEFAULT NULL,
                profilePicture TEXT DEFAULT NULL
            )
        `);

        // User-Cryptos and portfolio table

        db.run(`
            CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                user_id INTEGER NOT NULL, 
                name TEXT NOT NULL,  
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                FOREIGN KEY (user_id) REFERENCES users(id) 
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS user_cryptos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                crypto_symbol TEXT NOT NULL,
                purchase_price REAL, 
                purchase_currency TEXT, 
                purchase_date DATE, 
                amount REAL DEFAULT 0, 
                portfolio_id INTEGER, -- Add portfolio_id column
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
            )
        `);

        // Ensure index exists on portfolio_id and user_id
       db.run(`
                CREATE INDEX IF NOT EXISTS idx_portfolio_user 
                ON user_cryptos (portfolio_id, user_id);
       `);

        // Enable foreign key constraints
        db.run(`PRAGMA foreign_keys = ON;`);

        db.run(`
            CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                user_id INTEGER NOT NULL, 
                name TEXT NOT NULL,  
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
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

        // Store supported tokens we query from the API
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
            `PRAGMA table_info(users); `,
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

        // Check if 'oauthProvider' column exists in 'users' table
        db.run(`ALTER TABLE users ADD COLUMN oauthId TEXT UNIQUE DEFAULT NULL`, (alterErr) => {
            if (alterErr) {
                console.error('Error adding oauthId column:', alterErr.message);
            } else {
                console.log('oauthId column added successfully.');
            }
        });        
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

// Create a new portfolio for a user
function createPortfolio(userId, portfolioName, callback) {
    const query = `
        INSERT INTO portfolios (user_id, name)
        VALUES (?, ?)
    `;
    db.run(query, [userId, portfolioName], function (err) {
        if (err) {
            console.error('Error creating portfolio:', err.message);
            callback(err, null);
        } else {
            console.log(`Portfolio created successfully for user ID: ${userId}`);
            callback(null, this.lastID); // Return the newly created portfolio ID
        }
    });
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

// Fetch a user by their Google ID (oauthId)
function getUserByGoogleId(googleId, callback) {
    const query = `SELECT * FROM users WHERE oauthId = ?`;
    db.get(query, [googleId], (err, row) => {
        if (err) {
            console.error('Error fetching user by Google ID:', err.message);
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
}

// Create a new user in the database
function createUser({ email, googleId, name, picture }) {
    return new Promise(async (resolve, reject) => {
        const username = name ? name.replace(/\s+/g, '').toLowerCase() : email.split('@')[0];
        const placeholderPassword = `oauth-${googleId}`;

        db.run(
            `INSERT INTO users (username, email, password, oauthId, oauthProvider, profilePicture) VALUES (?, ?, ?, ?, ?, ?)`,
            [username, email, placeholderPassword, googleId, 'google', picture],
            function (err) {
                if (err) {
                    console.error('Error creating user:', err.message);
                    reject(err);
                } else {
                    console.log(`User created successfully with ID: ${this.lastID}`);
                    resolve({ id: this.lastID, username, email, picture });
                }
            }
        );
    });
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

// Add a function to save or update the portfolio in bulk
function savePortfolio(userId, portfolioId, portfolio, callback) {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Clear the existing portfolio for the given portfolio_id
        db.run(`DELETE FROM user_cryptos WHERE user_id = ? AND portfolio_id = ?`, [userId, portfolioId], (deleteErr) => {
            if (deleteErr) {
                console.error('Error clearing portfolio:', deleteErr.message);
                db.run('ROLLBACK');
                if (callback) callback(deleteErr);
                return;
            }

            const insertStmt = db.prepare(`
                INSERT INTO user_cryptos (user_id, portfolio_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            portfolio.forEach(({ Symbol, "Purchase Price": purchasePrice, Currency, "Purchase Date": purchaseDate, Amount }) => {
                insertStmt.run([userId, portfolioId, Symbol, purchasePrice, Currency, purchaseDate, Amount]);
            });

            insertStmt.finalize((finalizeErr) => {
                if (finalizeErr) {
                    console.error('Error finalizing portfolio insert:', finalizeErr.message);
                    db.run('ROLLBACK');
                    if (callback) callback(finalizeErr);
                } else {
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Error committing transaction:', commitErr.message);
                            db.run('ROLLBACK');
                            if (callback) callback(commitErr);
                        } else {
                            console.log('Portfolio saved successfully for portfolio_id:', portfolioId);
                            if (callback) callback(null);
                        }
                    });
                }
            });
        });
    });
}


function getUserByEmail(email, callback) {
    const query = `SELECT * FROM users WHERE email = ?`;
    db.get(query, [email], (err, row) => {
        if (err) {
            console.error('Error fetching user by email:', err.message);
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
}

function createUserWithImage({ email, googleId, name, imageBuffer }, callback) {
    const query = `
        INSERT INTO users (email, oauthId, username, profilePicture)
        VALUES (?, ?, ?, ?)
    `;
    db.run(query, [email, googleId, name, imageBuffer], function (err) {
        if (err) {
            console.error('Error creating user:', err.message);
            callback(err, null);
        } else {
            const userId = this.lastID; // ID of the newly created user

            // Automatically create a default portfolio for the user
            const portfolioQuery = `
                INSERT INTO portfolios (user_id, name)
                VALUES (?, 'Default Portfolio')
            `;
            db.run(portfolioQuery, [userId], (portfolioErr) => {
                if (portfolioErr) {
                    console.error('Error creating default portfolio:', portfolioErr.message);
                    callback(portfolioErr, null);
                } else {
                    callback(null, { id: userId, email, username: name });
                }
            });
        }
    });
}

function updateUserImage(googleId, imageBuffer, callback) {
    const query = `UPDATE users SET profilePicture = ? WHERE oauthId = ?`;
    db.run(query, [imageBuffer, googleId], (err) => {
        if (err) {
            console.error('Error updating user image:', err.message);
            callback(err);
        } else {
            callback(null);
        }
    });
}


// Export the function
module.exports = {
    db,
    initializeDatabase,
    // addUser,
    getHistoricalData,
    saveHistoricalData,
    saveAggregatedData,
    getAggregatedData,
    getUserByUsername,
    getUserByGoogleId,
    // createUser,
    updateSupportedTokens,
    saveSupportedTokens,
    saveOrUpdateCurrentPrice,
    savePortfolio,
    getUserByEmail,
    createUserWithImage,
    updateUserImage,
    createPortfolio,
};
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const ENV_PATH = '.env';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const bip39 = require('bip39');

// encryption
if (!process.env.ENCRYPTION_KEY) {
    try {
        console.warn('ENCRYPTION_KEY not set. Generating a new key...');
        const key = crypto.randomBytes(32).toString('hex');
        fs.appendFileSync('.env', `\nENCRYPTION_KEY=${key}`);
        console.log('New ENCRYPTION_KEY added to .env file');
    } catch (err) {
        console.error('Failed to write ENCRYPTION_KEY to .env:', err.message);
        process.exit(1); // Exit to prevent running without a valid encryption key
    }
}

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Cannot decrypt: input text is null or not a string');
    }

    const [iv, encryptedText] = text.split(':');
    if (!iv || !encryptedText) {
        throw new Error('Malformed encrypted text');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

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
        // Users table: 2FA and OAuth support
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sfa_sec_encrypted TEXT,
                sfa_enabled INTEGER DEFAULT 0,
                sfa_seed_encrypted TEXT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT DEFAULT NULL,
                oauthProvider TEXT DEFAULT NULL,
                oauthId TEXT UNIQUE DEFAULT NULL,
                profilePicture TEXT DEFAULT NULL,
                preferred_currency TEXT DEFAULT 'EUR',
                deleted INTEGER DEFAULT 0
            )
        `);

        // Create the temporary_2fa table for storing temporary 2FA setup data
        db.run(`
            CREATE TABLE IF NOT EXISTS temporary_2fa (
                user_id INTEGER PRIMARY KEY,
                secret TEXT NOT NULL,
                recovery_phrase TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // User-Cryptos and portfolio table

        db.run(`
                CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                user_id INTEGER NOT NULL, 
                name TEXT NOT NULL,  
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
                deleted INTEGER DEFAULT 0, 
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        db.run(`
                CREATE TABLE IF NOT EXISTS portfolio_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                portfolio_id INTEGER NOT NULL,
                value REAL NOT NULL,
                currency TEXT NOT NULL,
                last_updated DATETIME NOT NULL                
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

        // add audit log
        db.run(`
                CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                portfolio_id INTEGER,
                action TEXT NOT NULL, 
                crypto_symbol TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                details TEXT, 
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
            )
        `);

        // Ensure index exists on portfolio_id, portfolio_values and user_id
        db.run(`
                CREATE INDEX IF NOT EXISTS idx_portfolio_user 
                ON user_cryptos (portfolio_id, user_id);
       `);

       db.run(`
                CREATE INDEX IF NOT EXISTS idx_portfolio_values_last_updated 
                ON portfolio_values (portfolio_id, last_updated);
        `);

        // Enable foreign key constraints
        db.run(`PRAGMA foreign_keys = ON;`);

        // Historical Data table with index for optimized querying
        db.run(`
            CREATE TABLE IF NOT EXISTS historical_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crypto_symbol TEXT NOT NULL,
                date_time DATETIME NOT NULL,
                price_usd REAL,
                price_eur REAL,
                volume REAL,
                market_cap REAL,
                open REAL,
                high REAL,
                low REAL,
                volume_from REAL,
                volume_to REAL,
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
                UNIQUE(crypto_symbol, currency)
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
                market_cap REAL,
                UNIQUE (crypto_symbol, date)
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

        // history table
        db.run(`
            CREATE TABLE IF NOT EXISTS user_crypto_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                portfolio_id INTEGER NOT NULL,
                crypto_symbol TEXT NOT NULL,
                action TEXT NOT NULL, -- "Add" or "Sold"
                amount REAL NOT NULL,
                price REAL NOT NULL,
                purchase_currency TEXT,
                date DATETIME NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating user_crypto_history table:', err.message);
            } else {
                console.log('user_crypto_history table created or already exists.');
            }
        });

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
    const query = `SELECT * FROM users WHERE username = ? AND deleted = 0`;
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
    const query = `SELECT * FROM users WHERE email = ? AND deleted = 0`;
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
            const userId = this.lastID;

            // Always create a new portfolio
            const portfolioQuery = `
                INSERT INTO portfolios (user_id, name)
                VALUES (?, ?)
            `;
            db.run(portfolioQuery, [userId, `${email}`], function (portfolioErr) {
                if (portfolioErr) {
                    console.error('Error creating default portfolio:', portfolioErr.message);
                    callback(portfolioErr, null);
                } else {
                    const portfolioId = this.lastID;

                    // Log portfolio creation
                    logAuditAction(
                        userId,
                        portfolioId,
                        'ADD_PORTFOLIO',
                        null,
                        JSON.stringify({ name: email }),
                        (auditErr) => {
                            if (auditErr) {
                                console.warn('Failed to log portfolio creation:', auditErr.message);
                            }
                        }
                    );

                    console.log(`Portfolio created successfully for user ID: ${userId}`);
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

function logAuditAction(userId, portfolioId = null, action, cryptoSymbol = null, details = null, callback) {
    const query = `
        INSERT INTO audit_log (user_id, portfolio_id, action, crypto_symbol, details)
        VALUES (?, ?, ?, ?, ?)
    `;

    const formattedDetails = typeof details === "object" && details !== null
        ? JSON.stringify(details)
        : details || "{}";

    db.run(query, [userId, portfolioId, action, cryptoSymbol, formattedDetails], (err) => {
        if (err) {
            console.error(`Error logging audit action: ${err.message}`);
            if (callback) callback(err);
        } else {
            const logMessage = portfolioId
                ? `Audit logged: ${action} for portfolio ID ${portfolioId}`
                : `Audit logged: ${action} for cryptoSymbol ${cryptoSymbol}`;
            console.log(logMessage);
            if (callback) callback(null);
        }
    });
}

function markUserAsDeleted(userId, callback) {
    const query = `
        UPDATE users SET deleted = 1 WHERE id = ?
    `;
    db.run(query, [userId], function (err) {
        if (err) {
            console.error(`Error marking user ${userId} as deleted:`, err.message);
            if (callback) callback(err);
        } else {
            console.log(`User ${userId} marked as deleted.`);
            if (callback) callback(null);
        }
    });
}

function isUserActive(userId, callback) {
    const query = `
        SELECT deleted FROM users WHERE id = ? 
    `;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error(`Error checking active status for user ${userId}:`, err.message);
            callback(err, null);
        } else {
            const isActive = row?.deleted === 0;
            callback(null, isActive);
        }
    });
}

//helepr functions for 2FA

function getTwoFactorSecret(userId, callback) {
    const query = `SELECT sfa_sec_encrypted FROM users WHERE id = ?`;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('Error retrieving 2FA secret:', err.message);
            return callback(err, null);
        }

        if (!row || !row.sfa_sec_encrypted) {
            console.info(`No 2FA secret found for user ID: ${userId}`);
            return callback(null, null);
        }

        try {
            const decryptedSecret = decrypt(row.sfa_sec_encrypted);
            callback(null, decryptedSecret);
        } catch (error) {
            console.error('Error decrypting 2FA secret:', error.message);
            callback(error, null);
        }
    });
}

function disableTwoFactor(userId, callback) {
    const query = `UPDATE users SET sfa_enabled = 0, sfa_sec_encrypted = NULL WHERE id = ?`;
    db.run(query, [userId], function (err) {
        if (err) {
            console.error('Error disabling 2FA for user:', err.message);
            if (callback) callback(err);
        } else {
            console.log(`2FA disabled for user ID: ${userId}`);
            if (callback) callback(null);
        }
    });
}

function setTemporaryTwoFactorData(userId, secret, recoveryPhrase, callback) {
    const encryptedSecret = encrypt(secret);
    const encryptedRecoveryPhrase = encrypt(recoveryPhrase);

    const query = `
        INSERT INTO temporary_2fa (user_id, secret, recovery_phrase) 
        VALUES (?, ?, ?) 
        ON CONFLICT(user_id) 
        DO UPDATE SET secret = excluded.secret, recovery_phrase = excluded.recovery_phrase`;

    db.run(query, [userId, encryptedSecret, encryptedRecoveryPhrase], (err) => {
        if (err) {
            console.error('Error storing temporary 2FA data:', err.message);
            return callback(err);
        }
        console.log(`Temporary 2FA data set for user ID: ${userId}`); //DEBUG
        callback(null);
    });
}


function getTemporaryTwoFactorData(userId, callback) {
    const query = `SELECT secret, recovery_phrase FROM temporary_2fa WHERE user_id = ?`;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('Error retrieving temporary 2FA data:', err.message);
            return callback(err, null);
        }
        if (!row || !row.secret || !row.recovery_phrase) {
            console.warn('Temporary 2FA data is incomplete or missing for user ID:', userId);
            return callback(new Error('Temporary 2FA data not found or incomplete'), null);
        }
        callback(null, row);
    });
}


function setTwoFactorSecretAndSeed(userId, secret, recoveryPhrase, callback) {
    const encryptedSecret = encrypt(secret);
    const encryptedRecoveryPhrase = encrypt(recoveryPhrase);

    // Update the user's 2FA secret and recovery phrase
    const updateQuery = `UPDATE users SET sfa_sec_encrypted = ?, sfa_seed_encrypted = ?, sfa_enabled = 1 WHERE id = ?`;

    db.run(updateQuery, [encryptedSecret, encryptedRecoveryPhrase, userId], (err) => {
        if (err) {
            console.error('Error saving 2FA secret and recovery phrase:', err.message);
            return callback(err);
        }

        // After successful activation, delete the temporary 2FA data
        const deleteTempQuery = `DELETE FROM temporary_2fa WHERE user_id = ?`;
        db.run(deleteTempQuery, [userId], (tempErr) => {
            if (tempErr) {
                console.error('Error deleting temporary 2FA data:', tempErr.message);
                return callback(tempErr);
            }

            console.log(`2FA activated and temporary data deleted for user ID: ${userId}`);
            callback(null);
        });
    });
}

// delete temp table when 2fa is cancelled
function deleteTemporaryTwoFactorData(userId, callback) {
    const query = `DELETE FROM temporary_2fa WHERE user_id = ?`;
    db.run(query, [userId], (err) => {
        if (err) {
            console.error(`Error deleting temporary 2FA data for user ID ${userId}:`, err.message);
            return callback(err);
        }
        console.log(`Temporary 2FA data deleted for user ID: ${userId}`);
        callback(null);
    });
}

function getTwoFactorRecoverySeed(userId, callback) {
    const query = `SELECT sfa_seed_encrypted FROM users WHERE id = ?`;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error(`Error retrieving recovery seed for user ID ${userId}:`, err.message);
            return callback(err, null);
        }
        if (!row || !row.sfa_seed_encrypted) {
            console.warn(`No recovery seed found for user ID ${userId}`);
            return callback(new Error('Recovery seed not found'), null);
        }
        callback(null, row.sfa_seed_encrypted);
    });
}

function updateAggregatedData(cryptoSymbol, callback) {
    const query = `
        INSERT INTO aggregated_data (crypto_symbol, date, avg_price, total_volume, market_cap)
        SELECT
            crypto_symbol,
            date(date_time) AS day,
            AVG(price_usd) AS avg_price,
            SUM(volume) AS total_volume,
            AVG(market_cap) AS avg_market_cap
            FROM historical_data
            WHERE crypto_symbol = ?
            GROUP BY crypto_symbol, day
            ON CONFLICT (crypto_symbol, date) DO UPDATE SET
            avg_price = excluded.avg_price,
            total_volume = excluded.total_volume,
            market_cap = excluded.market_cap;
    `;
    db.run(query, [cryptoSymbol], (err) => {
        if (err) {
            console.error(`Error updating aggregated data for ${cryptoSymbol}:`, err.message);
        } else {
            console.log(`Aggregated data updated for ${cryptoSymbol}`);
        }
        if (callback) callback(err);
    });
}

// here are features and further optimization which needs to go live in PROD

// `price_btc` column in `current_prices`
db.all(`PRAGMA table_info(current_prices);`, (err, rows) => {
    if (err) {
        console.error('Error checking current_prices table schema:', err.message);
    } else if (!rows.find(col => col.name === 'price_btc')) {
        db.run(`ALTER TABLE current_prices ADD COLUMN price_btc REAL;`, (alterErr) => {
            if (alterErr) {
                console.error('Error adding price_btc column to current_prices:', alterErr.message);
            } else {
                console.log('price_btc column added to current_prices table.');
            }
        });
    }
});

// `price_btc` column in `historical_data`
db.all(`PRAGMA table_info(historical_data);`, (err, rows) => {
    if (err) {
        console.error('Error checking historical_data table schema:', err.message);
    } else if (!rows.find(col => col.name === 'price_btc')) {
        db.run(`ALTER TABLE historical_data ADD COLUMN price_btc REAL;`, (alterErr) => {
            if (alterErr) {
                console.error('Error adding price_btc column to historical_data:', alterErr.message);
            } else {
                console.log('price_btc column added to historical_data table.');
            }
        });
    }
});

// `price_eur` column in `historical_data`
db.all(`PRAGMA table_info(historical_data);`, (err, rows) => {
    if (err) {
        console.error('Error checking historical_data table schema:', err.message);
    } else if (!rows.find(col => col.name === 'price_eur')) {
        db.run(`ALTER TABLE historical_data ADD COLUMN price_eur REAL;`, (alterErr) => {
            if (alterErr) {
                console.error('Error adding price_eur column to historical_data:', alterErr.message);
            } else {
                console.log('price_eur column added to historical_data table.');
            }
        });
    }
});

// get all userid's
async function getAllActiveUserIds() {
    const sql = `
        SELECT DISTINCT user_id
        FROM portfolios
        WHERE deleted = 0;
    `;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error(`SQL Error (Fetching Active User IDs): ${err.message}`); // DEBUG
                reject(err);
            } else {
                const userIds = rows.map(row => row.user_id);
                // console.log('Fetched Active User IDs:', userIds); // DEBUG
                resolve(userIds);
            }
        });
    });
}

async function calculateAndSavePortfolioValues(userId) {
    try {
        // Fetch all portfolio tokens and quantities for the user
        const sqlPortfolioTokens = `
            SELECT uc.crypto_symbol, uc.amount, p.id AS portfolio_id
            FROM user_cryptos uc
            INNER JOIN portfolios p ON uc.portfolio_id = p.id
            WHERE p.user_id = ? AND p.deleted = 0 AND uc.amount > 0;
        `;
        const portfolioTokens = await new Promise((resolve, reject) => {
            db.all(sqlPortfolioTokens, [userId], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        if (!portfolioTokens.length) {
            return;
        }

        // Fetch current prices for all tokens
        const sqlCurrentPrices = `
            SELECT crypto_symbol, currency, price
            FROM current_prices
            WHERE crypto_symbol IN (${portfolioTokens.map(() => '?').join(',')});
        `;
        const currentPrices = await new Promise((resolve, reject) => {
            db.all(
                sqlCurrentPrices,
                portfolioTokens.map(token => token.crypto_symbol),
                (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(rows);
                }
            );
        });

        // Organize prices by symbol and currency
        const priceMap = {};
        currentPrices.forEach(({ crypto_symbol, currency, price }) => {
            if (!priceMap[crypto_symbol]) priceMap[crypto_symbol] = {};
            priceMap[crypto_symbol][currency] = price;
        });

        // Calculate portfolio values for each portfolio
        const portfolioValues = {};
        portfolioTokens.forEach(({ crypto_symbol, amount, portfolio_id }) => {
            if (!portfolioValues[portfolio_id]) {
                portfolioValues[portfolio_id] = { EUR: 0, USD: 0 };
            }

            const tokenPrices = priceMap[crypto_symbol] || {};
            const tokenQuantity = amount || 0;
            const priceEUR = tokenPrices.EUR || 0;
            const priceUSD = tokenPrices.USD || 0;

            portfolioValues[portfolio_id].EUR += priceEUR * tokenQuantity;
            portfolioValues[portfolio_id].USD += priceUSD * tokenQuantity;
        });

        // Write portfolio values into the database
        const timestamp = new Date().toISOString();
        const queries = [];
        Object.entries(portfolioValues).forEach(([portfolio_id, values]) => {
            queries.push([userId, portfolio_id, values.EUR, 'EUR', timestamp]);
            queries.push([userId, portfolio_id, values.USD, 'USD', timestamp]);
        });

        const sqlInsertValues = `
            INSERT INTO portfolio_values (user_id, portfolio_id, value, currency, last_updated)
            VALUES ${queries.map(() => '(?, ?, ?, ?, ?)').join(',')}
        `;

        await new Promise((resolve, reject) => {
            db.run(sqlInsertValues, queries.flat(), (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });

    } catch (err) {
        console.error(`Error calculating portfolio values for user ${userId}:`, err.message);
    }
}

// check db health
function checkDatabaseHealth() {
    db.get('SELECT 1;', (err) => {
        if (err) {
            console.error('Database health check failed:', err.message);
            process.exit(1);
        }
        console.log('Database health check passed.');
    });
}
checkDatabaseHealth();

// Export the function
module.exports = {
    db,
    initializeDatabase,
    getHistoricalData,
    saveHistoricalData,
    saveAggregatedData,
    getAggregatedData,
    getUserByUsername,
    getUserByGoogleId,
    updateSupportedTokens,
    saveSupportedTokens,
    saveOrUpdateCurrentPrice,
    savePortfolio,
    getUserByEmail,
    createUserWithImage,
    updateUserImage,
    logAuditAction,
    initializeDatabase,
    decrypt,
    getTwoFactorSecret,
    disableTwoFactor,
    setTemporaryTwoFactorData,
    getTemporaryTwoFactorData,
    setTwoFactorSecretAndSeed,
    deleteTemporaryTwoFactorData,
    getTwoFactorRecoverySeed,
    updateAggregatedData,
    calculateAndSavePortfolioValues,
    getAllActiveUserIds,
};
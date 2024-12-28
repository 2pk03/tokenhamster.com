const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./tracker.db');

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
                market_cap REAL
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
    });
}

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

// Add a user
function addUser(username, email, password, callback) {
    const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
    db.run(query, [username, email, password], function (err) {
        callback(err, this.lastID);
    });
}

// Add a crypto to track for a user
function addCrypto(userId, cryptoSymbol, callback) {
    const query = `INSERT INTO user_cryptos (user_id, crypto_symbol) VALUES (?, ?)`;
    db.run(query, [userId, cryptoSymbol], callback);
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

// Add admin user
const adminUsername = 'admin';
const adminEmail = 'admin@example.com';
const adminPassword = 'adminpassword';

db.get(
    `SELECT * FROM users WHERE username = ?`,
    [adminUsername],
    async (err, row) => {
        if (!row) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            db.run(
                `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
                [adminUsername, adminEmail, hashedPassword],
                (insertErr) => {
                    if (insertErr) {
                        console.error('Failed to insert admin user:', insertErr.message);
                    } else {
                        console.log('Admin user created successfully.');
                    }
                }
            );
        }
    }
);

// Exports
module.exports = {
    db,
    initializeDatabase, // Export initialization function
    addUser,
    addCrypto,
    getHistoricalData,
    saveHistoricalData,
    saveAggregatedData,
    getAggregatedData,
};

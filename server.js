const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./database'); // Import database functions

const app = express();
const PORT = process.env.PORT || process.env.DEFAULT_PORT || 4467;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';
const API_KEY_CRYPTOCOMPARE = process.env.API_KEY_CRYPTOCOMPARE;
const CRYPTOCOMPARE_BASE_URL = 'https://min-api.cryptocompare.com/data';

if (!API_KEY_CRYPTOCOMPARE) {
    console.log("Missing API_KEY_CRYPTOCOMPARE in .env file.");
    const readline = require('readline');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Enter your CryptoCompare API key: ', (apiKey) => {
        fs.appendFileSync('.env', `\nAPI_KEY_CRYPTOCOMPARE=${apiKey}\n`);
        console.log("API key saved to .env file. Restart the server to apply changes.");
        rl.close();
        process.exit();
    });
} else {
    app.use(bodyParser.json());
    app.use(cors());

    // Rate Limiter Configuration
    const limiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute window
        max: Math.floor(250000 / (30 * 24 * 60)), // Distribute 250,000 calls evenly per minute over a month
        message: "Too many requests, please try again later."
    });

    app.use(limiter); // Apply rate limiter globally

    const authRouter = express.Router();
    const cryptoRouter = express.Router();

    // Initialize Database
    db.initializeDatabase(); // Call database initialization function

    // Test API Key
    async function testApiKey() {
        try {
            const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
                params: {
                    fsym: 'BTC',
                    tsym: 'USD',
                    limit: 1,
                    api_key: API_KEY_CRYPTOCOMPARE
                }
            });
            if (response.data.Response === 'Success') {
                console.log('CryptoCompare API key works. Test data fetched successfully.');
            } else {
                console.error('CryptoCompare API key test failed:', response.data.Message);
            }
        } catch (error) {
            console.error('Error testing CryptoCompare API key:', error.message);
        }
    }

    testApiKey();

    // Authentication Routes
    authRouter.post('/register', async (req, res) => {
        const { username, email, password } = req.body;
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.addUser(username, email, hashedPassword, (err, userId) => {
                if (err) return res.status(400).json({ error: err.message });
                res.status(201).json({ id: userId, username });
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    authRouter.post('/login', (req, res) => {
        const { username, password } = req.body;
        db.getUserByUsername(username, async (err, user) => {
            if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

            const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token });
        });
    });

    // Middleware for Authentication
    function authenticateToken(req, res, next) {
        const token = req.headers['authorization'];
        if (!token) return res.status(401).json({ error: 'Access denied' });

        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.status(403).json({ error: 'Invalid token' });
            req.user = user;
            next();
        });
    }

    // CryptoCompare API Calls

    // Fetch historical data for a cryptocurrency
    cryptoRouter.get('/historical', authenticateToken, async (req, res) => {
        const { cryptoSymbol = 'BTC', limit = 30 } = req.query;
        try {
            const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
                params: {
                    fsym: cryptoSymbol,
                    tsym: 'USD',
                    limit,
                    api_key: API_KEY_CRYPTOCOMPARE
                }
            });
            res.json(response.data);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch historical data' });
        }
    });

    // Fetch current price data for a cryptocurrency
    cryptoRouter.get('/current', authenticateToken, async (req, res) => {
        const { cryptoSymbols = 'BTC,ETH' } = req.query;
        try {
            const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
                params: {
                    fsyms: cryptoSymbols,
                    tsyms: 'USD',
                    api_key: API_KEY_CRYPTOCOMPARE
                }
            });
            res.json(response.data);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch current price data' });
        }
    });

    // Add a cryptocurrency to the user's portfolio
    cryptoRouter.post('/portfolio/add', authenticateToken, async (req, res) => {
    const { cryptoSymbol, amount, purchaseDate } = req.body;
    const userId = req.user.id;

    try {
        // Fetch historical price for the purchase date
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
            params: {
                fsym: cryptoSymbol,
                tsym: 'USD',
                toTs: new Date(purchaseDate).getTime() / 1000,
                limit: 1,
                api_key: API_KEY_CRYPTOCOMPARE,
            },
        });

        const priceData = response.data.Data.Data[0];
        const purchasePrice = priceData.close;

        // Save to the database
        db.run(
            `INSERT INTO portfolio (user_id, crypto_symbol, amount, purchase_date, purchase_price)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, cryptoSymbol, amount, purchaseDate, purchasePrice],
            (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to add to portfolio' });
                }
                res.json({ message: 'Coin added to portfolio successfully', purchasePrice });
            }
        );
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch historical data' });
            }
    });

    // Fetch the user's portfolio
    cryptoRouter.get('/portfolio', authenticateToken, (req, res) => {
        const userId = req.user.id;
    
        db.all(
            `SELECT p.crypto_symbol, p.amount, p.purchase_date, p.purchase_price, h.price_usd AS current_price
             FROM portfolio p
             LEFT JOIN (
                 SELECT crypto_symbol, MAX(date_time) AS latest_date, price_usd
                 FROM historical_data
                 GROUP BY crypto_symbol
             ) h ON p.crypto_symbol = h.crypto_symbol
             WHERE p.user_id = ?`,
            [userId],
            (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to fetch portfolio' });
                }
    
                const portfolio = rows.map((row) => ({
                    cryptoSymbol: row.crypto_symbol,
                    amount: row.amount,
                    purchaseDate: row.purchase_date,
                    purchasePrice: row.purchase_price,
                    currentPrice: row.current_price,
                    currentValue: row.current_price * row.amount,
                    performance: ((row.current_price - row.purchase_price) / row.purchase_price) * 100,
                }));
    
                res.json(portfolio);
            }
        );
    });

    // Polling Mechanism for Fetching Data
    const pollingIntervals = {};

    function startPollingForUser(userId) {
        db.all(`SELECT * FROM user_crypto_settings WHERE user_id = ?`, [userId], (err, rows) => {
            if (err || !rows.length) return;

            rows.forEach(({ crypto_symbol, polling_interval }) => {
                if (pollingIntervals[crypto_symbol]) clearInterval(pollingIntervals[crypto_symbol]);

                pollingIntervals[crypto_symbol] = setInterval(async () => {
                    try {
                        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/pricemultifull`, {
                            params: {
                                fsyms: crypto_symbol,
                                tsyms: 'USD',
                                api_key: API_KEY_CRYPTOCOMPARE
                            }
                        });
                        console.log(`Fetched data for ${crypto_symbol}:`, response.data);
                        // Optionally store the response in the database
                    } catch (error) {
                        console.error(`Failed to fetch data for ${crypto_symbol}:`, error.message);
                    }
                }, polling_interval * 1000);
            });
        });
    }

    // Endpoint to Start Polling for a User
    cryptoRouter.post('/start-polling', authenticateToken, (req, res) => {
        const userId = req.user.id;
        startPollingForUser(userId);
        res.json({ message: 'Polling started for your tracked cryptocurrencies.' });
    });

    // Use Routers
    app.use('/api/auth', authRouter);
    app.use('/api/crypto', cryptoRouter);

    // Start Server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

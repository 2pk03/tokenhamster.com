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

const readline = require('readline');

function promptApiKey() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter your CryptoCompare API key: ', (apiKey) => {
        fs.appendFileSync('.env', `\nAPI_KEY_CRYPTOCOMPARE=${apiKey}\n`);
        console.log('API key saved to .env file. Restart the server to apply changes.');
        rl.close();
        process.exit();
    });
}

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

if (!API_KEY_CRYPTOCOMPARE) {
    promptApiKey();
} else {
    app.use(bodyParser.json());
    app.use(cors());

    // Rate Limiter Configuration
    const cryptoLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute window
        max: Math.floor(250000 / (30 * 24 * 60)), // Distribute 250,000 calls evenly per minute over a month
        message: "Too many requests, please try again later."
    });

    // Apply the limiter only to CryptoCompare-related routes
    app.use('/api/polling', cryptoLimiter);
    app.use('/api/price', cryptoLimiter);

    // Initialize Database
    db.initializeDatabase(); // Call database initialization function

    testApiKey();

    // CryptoCompare API Calls
    const routes = require('./routes'); // Handles all routes, including /api
    app.use('/api', routes);


    // Polling Mechanism for Fetching Data
    const pollingIntervals = {};

    function startPollingForUser(userId) {
        console.log(`Starting polling for user ID: ${userId}`);
        db.all(`SELECT * FROM user_crypto_settings WHERE user_id = ?`, [userId], (err, rows) => {
            if (err || !rows.length) {
                console.error(`No cryptos found to poll for user ID: ${userId}`);
                return;
            }

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
                        console.error(`Failed to fetch data for ${crypto_symbol}: ${error.message}`);
                    }
                }, polling_interval * 1000);
            });
        });
    }

    // Start Server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

    // Update Supported Tokens
    const { updateSupportedTokens } = require('./database');
    const cron = require('node-cron');

    cron.schedule('0 0 * * *', () => {
    console.log('Running daily token update...');
    updateSupportedTokens();
    });

    updateSupportedTokens();
}

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const cron = require('node-cron');
const { startPolling, stopPolling } = require('./services/pollingService'); // Import polling service
const { initializeDatabase, updateSupportedTokens } = require('./database'); // Database utilities

const app = express();
const PORT = process.env.PORT || 4467;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';
const API_KEY_CRYPTOCOMPARE = process.env.API_KEY_CRYPTOCOMPARE;
const CRYPTOCOMPARE_BASE_URL = 'https://min-api.cryptocompare.com/data';

// Test API Key
async function testApiKey() {
    try {
        const response = await axios.get(`${CRYPTOCOMPARE_BASE_URL}/v2/histoday`, {
            params: { fsym: 'BTC', tsym: 'USD', limit: 1, api_key: API_KEY_CRYPTOCOMPARE }
        });
        if (response.data.Response === 'Success') {
            console.log('CryptoCompare API key is valid.');
        } else {
            console.error('CryptoCompare API key test failed:', response.data.Message);
        }
    } catch (error) {
        console.error('Error testing CryptoCompare API key:', error.message);
    }
}

if (!API_KEY_CRYPTOCOMPARE) {
    console.error('CryptoCompare API key is missing. Please set it in the .env file.');
    process.exit(1);
}

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Centralized error handling middleware
app.use((err, req, res, next) => {
    console.error(`Error occurred: ${err.message}`);

    // Return a standardized error response
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});

// Rate Limiter
// const cryptoLimiter = rateLimit({
//     windowMs: 60 * 1000, // 1 minute window
//     max: Math.floor(250000 / (30 * 24 * 60)), // Distribute 250,000 calls evenly per minute over a month
//     message: "Too many requests, please try again later."
// });
// app.use('/api/polling', cryptoLimiter);
// app.use('/api/price', cryptoLimiter);

// Initialize Database
initializeDatabase();

// Test the CryptoCompare API Key
testApiKey();

// Routes
const routes = require('./routes');
app.use('/api', routes);

// Start Polling on Server Start
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Start polling service
    startPolling();

    // Update Supported Tokens Daily at Midnight
    cron.schedule('0 0 * * *', () => {
        console.log('Running daily token update...');
        updateSupportedTokens();
    });

    // Initial token update
    updateSupportedTokens();
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    stopPolling(); // Stop all polling intervals
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    stopPolling(); // Stop all polling intervals
    process.exit();
});

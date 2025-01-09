require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const { startPolling, stopPolling } = require('./services/pollingService');
const { initializeDatabase, updateSupportedTokens } = require('./database');
const { globalCors } = require('./security/cors'); // Import only globalCors
const { eventBusMiddleware } = require("./middleware/eventbus/express");

let SECRET_KEY = process.env.SECRET_KEY;


const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4467;
app.set('trust proxy', true);

const CRYPTOCOMPARE_BASE_URL = 'https://min-api.cryptocompare.com/data';

// Helper function to prompt user input for missing secrets
const promptInput = async (query) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

// Check required secrets
async function ensureSecrets() {
    const requiredSecrets = [
        'API_KEY_CRYPTOCOMPARE',
        'VUE_APP_GOOGLE_CLIENT_ID',
        'VUE_APP_GOOGLE_CLIENT_SECRET',
    ];

    let secretsUpdated = false;

    for (const secret of requiredSecrets) {
        if (!process.env[secret]) {
            console.error(`[ERROR] Missing required environment variable: ${secret}`);
            console.error(`[INFO] Please add ${secret} to your .env file.`);
            process.exit(1); // Terminate gracefully if a required variable is missing
        }
    }

    // Handle optional secrets
    if (!SECRET_KEY) {
        SECRET_KEY = crypto.randomBytes(64).toString('hex');
        secretsUpdated = true;
    }

    // Update .env file if optional secrets were generated
    if (secretsUpdated) {
        const envContent = Object.entries({ SECRET_KEY })
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        fs.writeFileSync('.env', envContent, { flag: 'a' }); // Append to .env
    }
}

// Initialize the app
async function initializeApp() {
    await ensureSecrets(); // Validate and collect secrets

    app.use(bodyParser.json());
    app.use(cors(globalCors)); // Use global CORS configuration

    // SSE Route via eventBusMiddleware
    app.get('/events', eventBusMiddleware);

    // Uncomment if rate limiting is required
    /*
    const rateLimit = require('express-rate-limit');
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per window
    });
    app.use(limiter);
    */

    // Database initialization
    initializeDatabase();

    // Routes setup
    const routes = require('./routes');
    app.use('/api', routes);

    // Start the server
    app.listen(PORT, () => {
        console.log(`[INFO] Server running on http://localhost:${PORT}`);
        startPolling();

        // Schedule daily token updates
        const cron = require('node-cron');
        cron.schedule('0 0 * * *', () => {
            console.log('[INFO] Running daily token update...');
            updateSupportedTokens();
        });

        // Initial token update
        updateSupportedTokens();
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => {
        console.log('[INFO] Shutting down server...');
        stopPolling();
        process.exit();
    });

    process.on('SIGTERM', () => {
        console.log('[INFO] Shutting down server...');
        stopPolling();
        process.exit();
    });
}

// Start the application
initializeApp();

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const { startPolling, stopPolling } = require('./services/pollingService');
const { initializeDatabase, updateSupportedTokens } = require('./database');
// const rateLimit = require('express-rate-limit'); // Rate limiter - Uncomment if needed

const app = express();
const PORT = process.env.PORT || 4467;

const CRYPTOCOMPARE_BASE_URL = 'https://min-api.cryptocompare.com/data';

// Existing environment variables
let API_KEY_CRYPTOCOMPARE = process.env.API_KEY_CRYPTOCOMPARE;
let VUE_APP_GOOGLE_CLIENT_ID = process.env.VUE_APP_GOOGLE_CLIENT_ID;
let VUE_APP_GOOGLE_CLIENT_SECRET = process.env.VUE_APP_GOOGLE_CLIENT_SECRET;
let SECRET_KEY = process.env.SECRET_KEY;

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

// check required secrets
async function ensureSecrets() {
    let secretsUpdated = false;

    const secrets = {
        API_KEY_CRYPTOCOMPARE,
        VUE_APP_GOOGLE_CLIENT_ID,
        VUE_APP_GOOGLE_CLIENT_SECRET,
    };

    for (const [key, value] of Object.entries(secrets)) {
        if (!value) {
            console.log(`[INFO] Missing secret: ${key}`);
            secrets[key] = await promptInput(`Enter value for ${key}: `);
            secretsUpdated = true;
        }
    }

    // generate SECRET_KEY if missing
    if (!SECRET_KEY) {
        SECRET_KEY = crypto.randomBytes(64).toString('hex');
        console.log('[INFO] JWT secret created dynamically.');
        secretsUpdated = true;
    }

    // Update .env file if any secrets were added
    if (secretsUpdated) {
        console.log('[INFO] Updating .env file with new secrets...');
        const envContent = Object.entries({ ...secrets, SECRET_KEY })
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        fs.writeFileSync('.env', envContent, { flag: 'a' }); // Append to .env
        console.log('[INFO] .env file updated successfully.');
    }
}

// Middleware setup
async function initializeApp() {
    await ensureSecrets(); // Validate and collect secrets

    app.use(bodyParser.json());
    app.use(cors());

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

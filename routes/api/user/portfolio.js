// routes/api/user/portfolio.js

const express = require('express');
const { db, savePortfolio } = require('../../../database');
const { addTokenToPolling } = require('../../../services/pollingService');
const router = express.Router();
const multer = require("multer");

// Configure multer to use memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        // Accept only .csv files
        if (!file.originalname.endsWith(".csv")) {
            return cb(new Error("Only CSV files are allowed."));
        }
        cb(null, true);
    },
});


// Fetch user portfolio
router.get('/fetch', (req, res) => {
    const userId = req.user.id;
  
    const query = `
      SELECT 
          uc.crypto_symbol AS symbol, 
          st.full_name AS full_name, 
          uc.purchase_price AS purchasePrice, 
          uc.purchase_currency AS purchaseCurrency, 
          uc.purchase_date AS purchaseDate,
          uc.amount AS amountBought
      FROM user_cryptos uc
      LEFT JOIN supported_tokens st ON uc.crypto_symbol = st.symbol
      WHERE uc.user_id = ? AND uc.portfolio_id = (
          SELECT id FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'
      )
    `;
  
    db.all(query, [userId, userId], (err, rows) => {
      if (err) {
        console.error('Failed to fetch portfolio:', err.message);
        return res.status(500).json({ error: 'Failed to fetch portfolio' });
      }
      res.json(rows);
    });
  });

// Add a token to portfolio
router.post('/add', async (req, res) => {
    const userId = req.user.id;
    const { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount } = req.body;

    if (!symbol || !purchasePrice || !purchaseCurrency || !purchaseDate || !amount) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const query = `
        INSERT INTO user_cryptos (user_id, portfolio_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
        VALUES (
            ?, 
            (SELECT id FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'), 
            ?, ?, ?, ?, ?
        )
    `;

    db.run(query, [userId, userId, symbol, purchasePrice, purchaseCurrency, purchaseDate, amount], (err) => {
        if (err) {
            console.error('Failed to add token:', err.message);
            return res.status(500).json({ error: 'Failed to add token.' });
        }
        res.json({ message: 'Token added successfully.' });
    });
});


// creae a new portfolio
router.post('/create', (req, res) => {
    const userId = req.user.id;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Portfolio name is required.' });
    }

    const query = `
        INSERT INTO portfolios (user_id, name)
        VALUES (?, ?)
    `;

    db.run(query, [userId, name], function (err) {
        if (err) {
            console.error('Failed to create portfolio:', err.message);
            return res.status(500).json({ error: 'Failed to create portfolio.' });
        }
        res.json({ message: 'Portfolio created successfully.', portfolioId: this.lastID });
    });
});

// Remove a token from portfolio
router.post('/remove', (req, res) => {
    const userId = req.user.id; // Already set by authenticateToken in the loader
    const { symbol } = req.body;

    if (!symbol) {
        console.error('Symbol is missing from the request body.');
        return res.status(400).json({ error: 'Symbol is required.' });
    }

    // Query to get the default portfolio ID
    const portfolioIdQuery = `
        SELECT id FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'
    `;
    db.get(portfolioIdQuery, [userId], (err, row) => {
        if (err || !row) {
            console.error('Failed to retrieve default portfolio ID:', err ? err.message : 'Not found');
            return res.status(500).json({ error: 'Default portfolio not found.' });
        }

        const portfolioId = row.id;

        console.log(`Removing token ${symbol} from user ID: ${userId}, portfolio ID: ${portfolioId}`);
        db.run(
            `DELETE FROM user_cryptos WHERE user_id = ? AND portfolio_id = ? AND crypto_symbol = ?`,
            [userId, portfolioId, symbol],
            (deleteErr) => {
                if (deleteErr) {
                    console.error(`Database error while removing token ${symbol}:`, deleteErr.message);
                    return res.status(500).json({ error: 'Failed to remove token.' });
                }
                console.log(`Token ${symbol} removed successfully for user ID: ${userId}, portfolio ID: ${portfolioId}`);
                res.json({ message: 'Token removed successfully.' });
            }
        );
    });
});

// import portfolio block

// helper to remove the first line
function parseCsvToPortfolio(csvContent) {
    const rows = csvContent.split("\n").map(row => row.split(","));
    const [header, ...data] = rows; // Skip the first line (header)

    return data.map(entry => {
        const [Symbol, purchasePrice, Currency, purchaseDate, Amount] = entry;
        return {
            Symbol: Symbol.trim(),
            "Purchase Price": parseFloat(purchasePrice),
            Currency: Currency.trim(),
            "Purchase Date": purchaseDate.trim(),
            Amount: parseFloat(Amount),
        };
    });
}

router.post("/import", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded or invalid file format." });
    }

    const userId = req.user.id;
    const fileContent = req.file.buffer.toString("utf8");

    try {
        const portfolio = parseCsvToPortfolio(fileContent);

        const portfolioIdQuery = `
            SELECT id FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'
        `;
        db.get(portfolioIdQuery, [userId], async (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: "Default portfolio not found." });
            }

            const portfolioId = row.id;

            // Save the portfolio data
            await savePortfolio(userId, portfolioId, portfolio);
            res.json({ message: "Portfolio imported successfully." });
        });
    } catch (error) {
        console.error("Error processing portfolio import:", error.message);
        res.status(500).json({ error: "Failed to import portfolio." });
    }
});

  
module.exports = router;

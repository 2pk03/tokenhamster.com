// routes/api/user/portfolio.js

const express = require('express');
const { db, savePortfolio, logAuditAction } = require('../../../database');
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

    // Retrieve the portfolio ID
    getDefaultPortfolioId(userId, (err, portfolioId) => {
        if (err || !portfolioId) {
            console.error('Error retrieving portfolio ID:', err ? err.message : 'Not found');
            return res.status(500).json({ error: 'Portfolio not found.' });
        }

        console.log(`Fetching portfolio for user ID: ${userId}, portfolio ID: ${portfolioId}`);
        fetchPortfolioData(userId, portfolioId, (fetchErr, rows) => {
            if (fetchErr) {
                console.error('Failed to fetch portfolio:', fetchErr.message);
                return res.status(500).json({ error: 'Failed to fetch portfolio' });
            }
            res.json(rows);
        });
    });
});

// Helper: Fetch portfolio data
function fetchPortfolioData(userId, portfolioId, callback) {
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
        WHERE uc.user_id = ? AND uc.portfolio_id = ?
    `;
    db.all(query, [userId, portfolioId], callback);
}

// Add a token to portfolio
router.post('/token/add', (req, res) => {
    const userId = req.user.id;
    const { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount } = req.body;

    if (!symbol || !purchasePrice || !purchaseCurrency || !purchaseDate || !amount) {
        console.error('Missing required fields:', { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount });
        return res.status(400).json({ error: 'All fields are required.' });
    }

    // Retrieve the portfolio ID
    getDefaultPortfolioId(userId, (err, portfolioId) => {
        if (err || !portfolioId) {
            console.error('Error retrieving portfolio ID:', err ? err.message : 'Not found');
            return res.status(500).json({ error: 'Portfolio not found.' });
        }

        console.log(`Adding token ${symbol} to user ID: ${userId}, portfolio ID: ${portfolioId}`);
        addTokenToPortfolio(userId, portfolioId, { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount }, (addErr) => {
            if (addErr) {
                console.error(`Failed to add token ${symbol}:`, addErr.message);
                return res.status(500).json({ error: 'Failed to add token.' });
            }

            // Log the audit action
            logPortfolioAudit(
                userId,
                portfolioId,
                'ADD_TOKEN',
                { symbol, purchasePrice, purchaseCurrency, purchaseDate, amount },
                (auditErr) => {
                    if (auditErr) {
                        console.warn('Failed to log audit action:', auditErr.message);
                    }
                }
            );

            console.log(`Token ${symbol} added successfully for user ID: ${userId}, portfolio ID: ${portfolioId}`);
            res.json({ message: 'Token added successfully.' });
        });
    });
});

// Helper: Add token to portfolio
function addTokenToPortfolio(userId, portfolioId, tokenData, callback) {
    const query = `
        INSERT INTO user_cryptos (user_id, portfolio_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
        query,
        [
            userId,
            portfolioId,
            tokenData.symbol,
            tokenData.purchasePrice,
            tokenData.purchaseCurrency,
            tokenData.purchaseDate,
            tokenData.amount,
        ],
        callback
    );
}

// Remove a token from portfolio
router.post('/token/remove', (req, res) => {
    const userId = req.user.id;
    const { symbol } = req.body;

    if (!symbol) {
        console.error('Symbol is missing from the request body.');
        return res.status(400).json({ error: 'Symbol is required.' });
    }

    // Retrieve the portfolio ID
    getDefaultPortfolioId(userId, (err, portfolioId) => {
        if (err || !portfolioId) {
            console.error('Error retrieving portfolio ID:', err ? err.message : 'Not found');
            return res.status(500).json({ error: 'Portfolio not found.' });
        }

        console.log(`Removing token ${symbol} from user ID: ${userId}, portfolio ID: ${portfolioId}`);
        removeTokenFromPortfolio(userId, portfolioId, symbol, (deleteErr) => {
            if (deleteErr) {
                console.error(`Database error while removing token ${symbol}:`, deleteErr.message);
                return res.status(500).json({ error: 'Failed to remove token.' });
            }

            // Log the audit action
            logPortfolioAudit(
                userId,
                portfolioId,
                'DELETE_TOKEN',
                { symbol },
                (auditErr) => {
                    if (auditErr) {
                        console.warn('Failed to log audit action:', auditErr.message);
                    }
                }
            );

            console.log(`Token ${symbol} removed successfully for user ID: ${userId}, portfolio ID: ${portfolioId}`);
            res.json({ message: 'Token removed successfully.' });
        });
    });
});

// Helper: Retrieve the active portfolio ID for a user
function getDefaultPortfolioId(userId, callback) {
    const query = `
        SELECT id FROM portfolios 
        WHERE user_id = ? AND deleted = 0 
        ORDER BY created_at ASC LIMIT 1
    `;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('Error fetching default portfolio:', err.message);
        }
        callback(err, row?.id);
    });
}

// Helper: Remove token from portfolio
function removeTokenFromPortfolio(userId, portfolioId, symbol, callback) {
    const query = `
        DELETE FROM user_cryptos WHERE user_id = ? AND portfolio_id = ? AND crypto_symbol = ?
    `;
    db.run(query, [userId, portfolioId, symbol], callback);
}

// Helper: Log portfolio-related audit actions
function logPortfolioAudit(userId, portfolioId, action, details = {}, callback) {
    const query = `
        INSERT INTO audit_log (user_id, portfolio_id, action, details)
        VALUES (?, ?, ?, ?)
    `;
    db.run(query, [userId, portfolioId, action, JSON.stringify(details)], (err) => {
        if (err) {
            console.error(`Error logging audit action: ${err.message}`);
        }
        callback(err);
    });
}

/* Create a new portfolio - later eventually
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
            console.error('Error creating portfolio:', err.message);
            return res.status(500).json({ error: 'Failed to create portfolio.' });
        }

        const portfolioId = this.lastID;

        // Log the audit action
        logAuditAction(
            userId,
            portfolioId,
            'ADD_PORTFOLIO',
            null,
            JSON.stringify({ name }),
            (auditErr) => {
                if (auditErr) {
                    console.warn('Failed to log portfolio creation audit:', auditErr.message);
                }
            }
        );

        res.json({ message: 'Portfolio created successfully.', portfolioId });
    });
});
*/

// Delete a portfolio
router.post('/delete', (req, res) => {
    const userId = req.user.id;
    const { portfolioId } = req.body;

    if (!portfolioId) {
        return res.status(400).json({ error: 'Portfolio ID is required.' });
    }

    // Retrieve portfolio name for audit log
    getPortfolioById(portfolioId, userId, (err, portfolio) => {
        if (err || !portfolio) {
            console.error('Error fetching portfolio for deletion:', err ? err.message : 'Not found');
            return res.status(404).json({ error: 'Portfolio not found.' });
        }

        const portfolioName = portfolio.name;

        // Mark the portfolio as deleted
        markPortfolioAsDeleted(portfolioId, userId, (updateErr) => {
            if (updateErr) {
                console.error('Error marking portfolio as deleted:', updateErr.message);
                return res.status(500).json({ error: 'Failed to mark portfolio for deletion.' });
            }

            // Log the audit action
            logPortfolioAudit(
                userId,
                portfolioId,
                'MARK_DELETE_PORTFOLIO',
                { name: portfolioName, deleted: true },
                (auditErr) => {
                    if (auditErr) {
                        console.warn('Failed to log portfolio deletion audit:', auditErr.message);
                    }
                }
            );

            res.json({ message: 'Portfolio marked for deletion successfully.' });
        });
    });
});

// Helper: Get portfolio by ID
function getPortfolioById(portfolioId, userId, callback) {
    const query = `
        SELECT id, name, deleted 
        FROM portfolios 
        WHERE id = ? AND user_id = ?
    `;
    db.get(query, [portfolioId, userId], (err, row) => {
        if (err) {
            console.error('Error fetching portfolio:', err.message);
            return callback(err, null);
        }
        if (!row) {
            console.warn(`Portfolio not found: ID ${portfolioId}, User ID ${userId}`);
            return callback(new Error('Portfolio not found.'), null);
        }
        callback(null, row);
    });
}

// Helper: Mark portfolio as deleted
function markPortfolioAsDeleted(portfolioId, userId, callback) {
    const query = `
        UPDATE portfolios 
        SET deleted = 1, updated_at = datetime('now') 
        WHERE id = ? AND user_id = ?
    `;
    db.run(query, [portfolioId, userId], function (err) {
        if (err) {
            console.error('Error marking portfolio as deleted:', err.message);
            return callback(err);
        }
        if (this.changes === 0) {
            console.warn(`No portfolio updated: ID ${portfolioId}, User ID ${userId}`);
            return callback(new Error('No portfolio found to update.'));
        }
        console.log(`Portfolio marked as deleted: ID ${portfolioId}, User ID ${userId}`);
        callback(null);
    });
}

// Helper: Log portfolio-related audit actions
function logPortfolioAudit(userId, portfolioId, action, details = {}, callback) {
    const query = `
        INSERT INTO audit_log (user_id, portfolio_id, action, details)
        VALUES (?, ?, ?, ?)
    `;
    db.run(query, [userId, portfolioId, action, JSON.stringify(details)], (err) => {
        if (err) {
            console.error(`Error logging audit action: ${err.message}`);
        }
        callback(err);
    });
}

// import portfolio CSV
router.post('/import', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fileContent = req.file.buffer.toString('utf-8');

    // Parse CSV content into portfolio data
    const portfolioData = parseCsvToPortfolio(fileContent);

    if (portfolioData.length === 0) {
        return res.status(400).json({ error: 'CSV file is empty or invalid.' });
    }

    // Fetch the active portfolio for the user
    const checkPortfolioQuery = `
        SELECT id FROM portfolios WHERE user_id = ? AND deleted = 0
    `;
    db.get(checkPortfolioQuery, [req.user.id], (err, portfolio) => {
        if (err || !portfolio) {
            console.error('Error fetching active portfolio:', err ? err.message : 'No active portfolio found.');
            return res.status(500).json({ error: 'Active portfolio not found. Please contact support.' });
        }

        const portfolioId = portfolio.id;
        console.log(`Using active portfolio ID: ${portfolioId}`);

        // Proceed to import tokens into the active portfolio
        importTokens(portfolioId, portfolioData, req, res);
    });
});

// Helper to parse CSV content into portfolio data
function parseCsvToPortfolio(csvContent) {
    const rows = csvContent.split("\n").filter((row) => row.trim()); // Remove empty lines
    const [header, ...data] = rows; // Extract header and rows

    if (!header || header.toLowerCase() !== 'crypto_symbol,purchase_price,purchase_currency,purchase_date,amount') {
        throw new Error('Invalid CSV header. Expected: crypto_symbol,purchase_price,purchase_currency,purchase_date,amount');
    }

    return data.map((row, index) => {
        const fields = row.split(",");
        if (fields.length !== 5) {
            console.warn(`Skipping invalid row at line ${index + 2}: ${row}`);
            return null; // Skip malformed rows
        }

        const [crypto_symbol, purchase_price, purchase_currency, purchase_date, amount] = fields.map((field) => field.trim());

        if (!crypto_symbol || isNaN(parseFloat(purchase_price)) || !purchase_currency || isNaN(parseFloat(amount))) {
            console.warn(`Skipping invalid row at line ${index + 2}: ${row}`);
            return null;
        }

        return {
            crypto_symbol,
            purchase_price: parseFloat(purchase_price),
            purchase_currency,
            purchase_date,
            amount: parseFloat(amount),
        };
    }).filter((row) => row !== null); // Filter out invalid rows
}

// Helper to import tokens into a portfolio
function importTokens(portfolioId, portfolioData, req, res) {
    const query = `
        INSERT INTO user_cryptos (user_id, portfolio_id, crypto_symbol, purchase_price, purchase_currency, purchase_date, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.serialize(() => {
        const stmt = db.prepare(query);
        const importedTokens = []; // Track imported tokens

        portfolioData.forEach((row, index) => {
            stmt.run(
                [req.user.id, portfolioId, row.crypto_symbol, row.purchase_price, row.purchase_currency, row.purchase_date, row.amount],
                (stmtErr) => {
                    if (!stmtErr) {
                        importedTokens.push(row.crypto_symbol); // Track successful imports
                    } else {
                        console.error(`Error inserting row at line ${index + 2}:`, stmtErr.message);
                    }
                }
            );
        });

        stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
                console.error('Error finalizing statement:', finalizeErr.message);
                return res.status(500).json({ error: 'Failed to import portfolio.' });
            }

            // Log the audit action with imported tokens
            const details = {
                count: importedTokens.length,
                tokens: importedTokens,
            };

            logAuditAction(
                req.user.id,
                portfolioId,
                'IMPORT_PORTFOLIO',
                null,
                JSON.stringify(details),
                (auditErr) => {
                    if (auditErr) {
                        console.warn('Failed to log portfolio import audit:', auditErr.message);
                    }
                }
            );

            res.json({ message: `Portfolio imported successfully. Imported ${importedTokens.length} entries.` });
        });
    });
}

// Export portfolio
router.get('/export', (req, res) => {
    const userId = req.user.id;

    // Retrieve the active portfolio ID
    getDefaultPortfolioId(userId, (err, portfolioId) => {
        if (err || !portfolioId) {
            console.error('Error retrieving default portfolio ID:', err ? err.message : 'Not found');
            return res.status(500).json({ error: 'Default portfolio not found.' });
        }

        console.log(`Exporting portfolio for user ID: ${userId}, portfolio ID: ${portfolioId}`);
        fetchPortfolioForExport(userId, portfolioId, (fetchErr, rows) => {
            if (fetchErr) {
                console.error('Error exporting portfolio:', fetchErr.message);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'No portfolio data found.' });
            }

            // Convert rows to CSV
            const csvHeaders = 'crypto_symbol,purchase_price,purchase_currency,purchase_date,amount\n';
            const csvRows = rows
                .map(row => `${row.crypto_symbol},${row.purchase_price},${row.purchase_currency},${row.purchase_date},${row.amount}`)
                .join('\n');
            const csvContent = csvHeaders + csvRows;

            // Send CSV as attachment
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="portfolio.csv"');
            res.send(csvContent);

            // Log the audit action
            logPortfolioAudit(
                userId,
                portfolioId,
                'EXPORT_PORTFOLIO',
                { count: rows.length },
                (auditErr) => {
                    if (auditErr) {
                        console.warn('Failed to log portfolio export audit:', auditErr.message);
                    } else {
                        console.log(`Portfolio export logged successfully for user ID: ${userId}`);
                    }
                }
            );
        });
    });
});

// Helper: Fetch portfolio for export
function fetchPortfolioForExport(userId, portfolioId, callback) {
    const query = `
        SELECT uc.crypto_symbol, uc.purchase_price, uc.purchase_currency, uc.purchase_date, uc.amount
        FROM user_cryptos uc
        WHERE uc.user_id = ? AND uc.portfolio_id = ?
    `;
    db.all(query, [userId, portfolioId], callback);
}

// download audit logs
router.get('/audit/logs', (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
        SELECT action, crypto_symbol, timestamp, details
        FROM audit_log
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    `;

    db.all(query, [userId, parseInt(limit), parseInt(offset)], (err, rows) => {
        if (err) {
            console.error('Error fetching audit logs:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check if there's an ADD_PORTFOLIO log
        const hasPortfolioCreationLog = rows.some(row => row.action === 'ADD_PORTFOLIO');

        if (!hasPortfolioCreationLog) {
            // Fetch portfolio creation time from the database
            db.get(
                `SELECT created_at AS timestamp FROM portfolios WHERE user_id = ? AND name = 'Default Portfolio'`,
                [userId],
                (portfolioErr, portfolio) => {
                    if (portfolioErr) {
                        console.error('Error fetching portfolio creation time:', portfolioErr.message);
                        return res.json(rows); // Return existing rows without adding a log
                    }

                    if (portfolio) {
                        rows.unshift({
                            action: 'ADD_PORTFOLIO',
                            crypto_symbol: null,
                            timestamp: portfolio.timestamp || null,
                            details: null,
                        });
                    }

                    res.json(rows);
                }
            );
        } else {
            res.json(rows);
        }
    });
});

module.exports = router;

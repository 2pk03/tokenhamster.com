const express = require('express');
const { db } = require('../../../database');
const router = express.Router();

// Fetch supported currencies
router.get('/supported', (req, res) => {
    const query = req.query.query || '';
    const sqlQuery = `
        SELECT * FROM supported_tokens
        WHERE full_name LIKE ? OR symbol LIKE ?
        LIMIT 10
    `;
    const searchTerm = `%${query}%`;

    db.all(sqlQuery, [searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error('Database error while fetching supported currencies:', err.message);
            return res.status(500).json({ error: 'Failed to fetch currencies' });
        }
        res.json(rows);
    });
});

module.exports = router;

// security/cors.js

const allowedOrigins = [
    'https://www.tokenhamster.com',
    'https://tokenhamster.com',
    'http://localhost:8080',
];

// Global CORS middleware configuration
const globalCors = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`[CORS] Origin not allowed: ${origin}`);
            callback(new Error('Not allowed.'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
};

// SSE-specific CORS logic
const sseCors = (req, res) => {
    const origin = req.headers.origin;
    // console.log(`[SSE] Origin Header Received: ${origin}`); // Debug logging

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        return true; // Allow the request to proceed
    } else {
        console.error(`[CORS] SSE origin not allowed: ${origin}`);
        res.status(403).send('Not allowed by CORS');
        return false; // Block further processing
    }
};

module.exports = { globalCors, sseCors };
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
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
};

// SSE-specific CORS logic
const sseCors = (req, res) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        console.error(`[CORS] SSE origin not allowed: ${origin}`);
        res.status(403).send('Not allowed by CORS');
        return false; // Stop further processing
    }
    return true; // Proceed with the request
};

module.exports = { globalCors, sseCors };
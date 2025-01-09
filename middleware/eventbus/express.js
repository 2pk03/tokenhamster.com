// middleware/eventbus/express.js

const clients = new Set();
const { sseCors } = require('../../security/cors');

const addClient = (res) => clients.add(res);
const removeClient = (res) => clients.delete(res);

const broadcast = (event, data) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((client) => client.write(message));
};

const eventBusMiddleware = (req, res) => {
    if (!sseCors(req, res)) return; // Validate CORS for SSE

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    addClient(res);

    res.write(`event: connected\ndata: "SSE connection established"\n\n`);

    req.on('close', () => {
        removeClient(res);
        res.end();
    });
};

module.exports = {
    eventBusMiddleware,
    broadcast,
};

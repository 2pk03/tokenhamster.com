const express = require('express');
const fs = require('fs');
const path = require('path');
const authenticateToken = require('../middleware/authenticateToken');

const router = express.Router();

// Path to the API routes directory
const apiRoutesPath = path.join(__dirname, 'api');

// Dynamically load all route files in the api directory
const routeFiles = fs.readdirSync(apiRoutesPath).filter((file) => file.endsWith('.js'));

routeFiles.forEach((file) => {
  const route = require(path.join(apiRoutesPath, file));
  const routeName = `/${file.replace('.js', '')}`;

  // Do not apply authentication to the login route
  if (routeName === '/auth') {
    console.log(`Registering public API route: /api${routeName}`);
    router.use(routeName, route); // No `authenticateToken` here
  } else {
    console.log(`Registering protected API route: /api${routeName}`);
    router.use(routeName, authenticateToken, route);
  }
});

module.exports = router;

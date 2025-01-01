// routes/index.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const authenticateToken = require('../middleware/authenticateToken');

const router = express.Router();

const loadRoutes = (dir, prefix = '') => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadRoutes(fullPath, `${prefix}/${entry.name}`);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const route = require(fullPath);
      const routeName = `${prefix}/${entry.name.replace('.js', '')}`;
      
      if (routeName.includes('/auth')) {
        console.log(`Registering public API route: ${routeName}`); 
        router.use(routeName, route); // Public routes like auth (skip authentication)
      } else {
        console.log(`Registering protected API route: ${routeName}`);
        router.use(routeName, authenticateToken, route); // Protected routes
      }
    }
  });
};

// Dynamically load all routes from "routes/api" without the "/api" prefix
loadRoutes(path.join(__dirname, 'api'));

module.exports = router;
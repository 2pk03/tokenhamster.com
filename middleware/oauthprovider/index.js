// middleware/oauthprovider/index.js

const fs = require('fs');
const path = require('path');
const passport = require('passport');

// Dynamically load all provider files in this directory
const loadStrategies = () => {
  const strategiesPath = __dirname;
  fs.readdirSync(strategiesPath).forEach((file) => {
    if (file !== 'index.js' && file.endsWith('.js')) {
      // console.log(`Loading OAuth strategy: ${file}`); // DEBUG
      require(path.join(strategiesPath, file)); // Each file must configure passport
    }
  });
};

module.exports = { passport, loadStrategies };

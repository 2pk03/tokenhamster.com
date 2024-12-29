// config.js
require('dotenv').config();

const API_KEY_CRYPTOCOMPARE = process.env.API_KEY_CRYPTOCOMPARE;
const CRYPTOCOMPARE_BASE_URL = 'https://min-api.cryptocompare.com/data';

module.exports = {
  API_KEY_CRYPTOCOMPARE,
  CRYPTOCOMPARE_BASE_URL,
};

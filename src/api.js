// src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4467/api', // Replace with your backend URL
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

// src/api.js
import axios from 'axios';

// Create an Axios instance
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
}, (error) => {
  // Handle request errors
  return Promise.reject(error);
});

// Handle session timeout in responses
api.interceptors.response.use(
  (response) => response, // Pass successful responses
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Trigger session timeout event
      const event = new Event('sessionTimeout');
      window.dispatchEvent(event);
    }
    return Promise.reject(error); // Reject the error for further handling
  }
);

export default api;

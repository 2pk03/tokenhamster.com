// src/api.js
import axios from 'axios';

// Use environment variable for the backend URL
const api = axios.create({
  baseURL: process.env.VUE_APP_API_BASE_URL || 'http://localhost:4467/api', // Fallback for development
});

console.log('API Base URL:', process.env.VUE_APP_API_BASE_URL || 'http://localhost:4467/api');

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle session timeout in responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const event = new Event('sessionTimeout');
      window.dispatchEvent(event);
    }
    return Promise.reject(error);
  }
);

// Utility method to get profile image URL
export function getProfileImageUrl(userId) {
  const apiBaseUrl = process.env.VUE_APP_API_BASE_URL || 'http://localhost:4467/api';
  return `${apiBaseUrl}/user/profile/image/${userId}`;
}

export default api;
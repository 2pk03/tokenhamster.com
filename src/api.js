// src/api.js
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import store from './store';
import router from './router';

// Use environment variable for the backend URL
const api = axios.create({
  baseURL: process.env.VUE_APP_API_BASE_URL || 'http://localhost:4467/api', // Fallback for development
});

// console.log('API Base URL:', process.env.VUE_APP_API_BASE_URL || 'http://localhost:4467/api'); // DEBUG

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);

      if (decoded.exp <= now) {
        console.warn('Token expired. Logging out and redirecting to login.');
        localStorage.removeItem('token');
        store.dispatch('auth/logout');
        router.push('/login');
        return Promise.reject(new Error('Token expired.'));
      }

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
      console.warn('Session expired. Redirecting to login.');
      localStorage.removeItem('token'); 
      store.dispatch('auth/logout'); 
      router.push('/login'); 
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
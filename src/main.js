// src/main.js

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/global.css';
import store from './store';
import { jwtDecode } from 'jwt-decode';
import { GoogleLogin } from 'vue3-google-login';

const GOOGLE_CLIENT_ID = process.env.VUE_APP_GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
    console.error('Google Client ID is missing! Please set GOOGLE_CLIENT_ID in your .env file.');
}

const app = createApp(App);

// Properly initialize Google Login Plugin
app.component('GoogleLogin', GoogleLogin);

// Refresh token interval
let refreshInterval = null;

const startRefreshInterval = () => {
    if (refreshInterval) return; // Prevent multiple intervals

    refreshInterval = setInterval(() => {
        const token = store.state.auth.token;
        if (token) {
            const decoded = jwtDecode(token);
            const now = Math.floor(Date.now() / 1000);

            // If token is about to expire, refresh it
            if (decoded.exp - now < 5 * 60) { // 5 minutes before expiration
                store.dispatch('auth/refreshToken');
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
};

// Stop refresh interval
const stopRefreshInterval = () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
};

// Check token validity on app load
const token = store.state.auth.token;
if (token) {
    const decoded = jwtDecode(token);
    const now = Math.floor(Date.now() / 1000);

    if (decoded.exp < now) {
        console.warn('Token expired on app load. Logging out.');
        store.dispatch('auth/logout');
    } else {
        startRefreshInterval(); // Start refreshing tokens if valid
    }
}

store.watch(
    (state) => state.auth.token,
    (newToken) => {
        if (newToken) {
            startRefreshInterval();
        } else {
            stopRefreshInterval();
        }
    }
);

app.use(router).use(store).mount('#app');

// src/main.js

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/global.css';
import store from './store';
import { jwtDecode } from 'jwt-decode';
import { initializeRelay, closeRelay } from "@/services/relayService";

const app = createApp(App);

initializeRelay();
app.mixin({
    beforeUnmount() {
      closeRelay();
    },
  });


// Refresh token interval
let refreshInterval = null;

// console.log('Initial Store State:', store.state.auth); // Debugging

const startRefreshInterval = () => {
    if (refreshInterval) return; // Prevent multiple intervals

    refreshInterval = setInterval(() => {
        const token = store.state.auth.token;
        if (token) {
            const now = Math.floor(Date.now() / 1000);
            const decoded = jwtDecode(token);

            if (decoded.exp <= now) {
                console.warn('Logging out.');
                store.dispatch('auth/logout');
            } else {
                console.log('Token valid.');
            }
        }
    }, 5 * 60 * 1000); // Refresh every 5 minutes
};

const stopRefreshInterval = () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
};

// Check token validity on app load
const token = store.state.auth.token;
if (token) {
    try {
        const decoded = jwtDecode(token);
        const now = Math.floor(Date.now() / 1000);

        if (decoded.exp < now) {
            console.warn('Token expired on app load. Logging out.');
            store.dispatch('auth/logout');
        } else {
            // console.log('Token valid. Initializing refresh interval.'); // DEBUG
            store.commit('auth/setUser', decoded); // Update user state
            startRefreshInterval(); // Start refreshing tokens if valid
        }
    } catch (error) {
        console.error("Invalid or malformed token. Logging out.", error);
        store.dispatch('auth/logout');
    }
} else {
    console.warn("No token found on app load.");
}

// Watch for token changes
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

// Google Token Validation for OAuth Login
window.handleGoogleCallback = async (response) => {
    // console.log("Google OAuth Callback Response:", response); // DEBUG

    try {
        const idToken = response.credential;
        const backendResponse = await fetch('/api/user/auth/google/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ idToken }),
        });

        if (!backendResponse.ok) {
            throw new Error('Failed to validate token with backend.');
        }

        const { token } = await backendResponse.json();
        store.commit('auth/setToken', token);
        store.commit('auth/setUser', jwtDecode(token));

        // console.log('Google token validated and user authenticated:', jwtDecode(token)); // DEBUG

        // Redirect to portfolio
        router.push('/portfolio');
    } catch (error) {
        console.error('Google Token Validation Error:', error);
        alert('Google login failed. Please try again.');
    }
};

// Google OAuth token validation
window.handleGoogleCallback = async (response) => {
    // console.log("Google OAuth Callback Response:", response); // DEBUG

    const idToken = response?.credential; // Check if credential exists
    if (!idToken) {
        console.error('No Google ID token received.');
        alert('Google login failed. No token received.');
        return;
    }

    try {
        const backendResponse = await fetch('/api/user/auth/google/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ idToken }),
        });

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text();
            console.error('Backend response error:', errorText);
            throw new Error('Failed to validate token with backend.');
        }

        const { token } = await backendResponse.json();

        // Commit to Vuex store
        store.commit('auth/setToken', token);
        store.commit('auth/setUser', jwtDecode(token));
        // console.log('Google token validated and user authenticated:', jwtDecode(token)); // DEBUG

        // Redirect to a protected route
        router.push('/portfolio');
    } catch (error) {
        console.error('Google Token Validation Error:', error);
        alert('Google login failed. Please try again.');
    }
};

// Log debugging information for Google OAuth
// console.log('Google Client ID:', process.env.VUE_APP_GOOGLE_CLIENT_ID); // DEBUG

// Initialize Vue App
createApp(App)
    .use(router)
    .use(store)
    .mount('#app');

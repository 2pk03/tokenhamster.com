// src/store/auth.js

import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import router from '../router';

const state = {
    token: localStorage.getItem('token') || null,
    user: localStorage.getItem('token') ? jwtDecode(localStorage.getItem('token')) : null,
    isAuthenticated: !!localStorage.getItem('token'),
};

const mutations = {
    setToken(state, token) {
        state.token = token;
        localStorage.setItem('token', token);

        // Update isAuthenticated and user when setting a token
        state.isAuthenticated = !!token;
        state.user = token ? jwtDecode(token) : null;
    },
    setUser(state, user) {
        state.user = user;
    },
    clearAuth(state) {
        state.token = null;
        state.user = null;
        state.isAuthenticated = false; // Explicitly mark as unauthenticated
        localStorage.removeItem('token');
    },
};


const actions = {

    // handle token expiration
    monitorTokenExpiration({ state, dispatch }) {
        setInterval(() => {
            const token = state.token;
            if (!token) return;

            const decoded = jwtDecode(token);
            const now = Math.floor(Date.now() / 1000);

            if (decoded.exp < now) {
                console.warn('Token expired. Logging out.');
                dispatch('logout');
                window.location.href = '/login';
            }
        }, 60000); // Check every minute
    },

    // Google login
    async googleLogin({ commit, dispatch }, idToken) {
        try {
            const response = await axios.post('/api/user/auth/google/validate', { idToken });
            commit('setToken', response.data.token);
            commit('setUser', jwtDecode(response.data.token));
            dispatch('monitorTokenExpiration');
        } catch (error) {
            console.error('Google login failed:', error);
            throw new Error('Google login failed. Please try again.');
        }
    },

    // Refresh token
    async refreshToken({ commit, state, dispatch }) {
        if (!state.token) return;
        try {
            const decoded = jwtDecode(state.token);
            const now = Math.floor(Date.now() / 1000);

            if (decoded.exp < now) {
                console.warn('Token expired. Logging out.');
                dispatch('logout');
                return;
            }

            const response = await axios.post('/api/user/auth/refresh-token', {}, {
                headers: { Authorization: `Bearer ${state.token}` },
            });

            commit('setToken', response.data.token);
            commit('setUser', jwtDecode(response.data.token));
        } catch (error) {
            console.error('Error refreshing token:', error);
            dispatch('logout');
        }
    },

    // Logout
    logout({ commit }) {
        commit('clearToken');
        router.push('/login'); 
      },
};

const getters = {
    isAuthenticated: (state) => state.isAuthenticated,
    user: (state) => state.user,
};

export default {
    namespaced: true,
    state,
    mutations,
    actions,
    getters,
};

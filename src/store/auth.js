// src/store/auth.js

import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

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
    // Username/password login
    async login({ commit }, credentials) {
        const response = await axios.post('/api/user/auth/login', credentials);
        commit('setToken', response.data.token);
        commit('setUser', jwtDecode(response.data.token));
    },

    // Google login
    async googleLogin({ commit }, idToken) {
        try {
            const response = await axios.post('/api/user/auth/google/validate', { idToken });
            commit('setToken', response.data.token);
            commit('setUser', jwtDecode(response.data.token));
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
        commit('clearAuth');
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

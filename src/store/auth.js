// src/store/auth.js

import { jwtDecode } from 'jwt-decode';
import axios from 'axios';

const state = {
    token: localStorage.getItem('token') || null,
    user: null,
};

const mutations = {
    setToken(state, token) {
        state.token = token;
        localStorage.setItem('token', token);
    },
    setUser(state, user) {
        state.user = user;
    },
    clearAuth(state) {
        state.token = null;
        state.user = null;
        localStorage.removeItem('token');
    },
};

const actions = {
    async login({ commit }, credentials) {
        const response = await axios.post('/api/user/auth/login', credentials);
        commit('setToken', response.data.token);
        commit('setUser', jwtDecode(response.data.token));
    },
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
    logout({ commit }) {
        commit('clearAuth');
    },
};

const getters = {
    isAuthenticated: (state) => !!state.token,
    user: (state) => state.user,
};

export default {
    namespaced: true,
    state,
    mutations,
    actions,
    getters,
};

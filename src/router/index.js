// src/router/index.js

import { createRouter, createWebHistory } from 'vue-router';
import store from '@/store';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import Login from '@/components/LoginPage.vue';
import Portfolio from '@/components/PortfolioPage.vue';
import Profile from '@/components/ProfilePage.vue';
import Account from '@/components/AccountPage.vue';

const routes = [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'Login', component: Login },
    {
        path: '/',
        component: DefaultLayout,
        children: [
            { path: 'portfolio', name: 'Portfolio', component: Portfolio, meta: { requiresAuth: true } },
            { path: 'profile', name: 'Profile', component: Profile, meta: { requiresAuth: true } },
            { path: 'account', name: 'Account', component: Account, meta: { requiresAuth: true } },
        ],
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

router.beforeEach((to, from, next) => {
    const backendRoutes = ['/user/auth/google', '/user/auth/google/callback'];

    // Handle backend-delegated routes
    if (backendRoutes.includes(to.path)) {
        // console.log(`Delegating ${to.path} to backend.`); // DEBUG
        window.location.href = to.fullPath; // Redirect the browser to the backend
        return; // Prevent further Vue Router processing
    }

    const isAuthenticated = store.getters['auth/isAuthenticated'];
    // console.log(`Route Guard: Navigating to ${to.path}, Authenticated: ${isAuthenticated}`); // DEBUG

    // Redirect unauthenticated users trying to access protected routes
    if (to.meta.requiresAuth && !isAuthenticated) {
        // console.log('Access denied: Redirecting to login'); //DEBUG
        return next('/login');
    }

    next(); 
});

export default router;
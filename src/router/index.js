import { createRouter, createWebHistory } from 'vue-router';
import store from '@/store';
import Login from '@/components/LoginPage.vue';
import Portfolio from '@/components/PortfolioPage.vue';
import Profile from '@/components/ProfilePage.vue'; // Import ProfilePage

const routes = [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'Login', component: Login },
    { path: '/portfolio', name: 'Portfolio', component: Portfolio, meta: { requiresAuth: true } },
    { path: '/profile', name: 'Profile', component: Profile, meta: { requiresAuth: true } }, // Add Profile route
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

// Add navigation guard
router.beforeEach((to, from, next) => {
    const isAuthenticated = store.getters['auth/isAuthenticated'];
    if (to.meta.requiresAuth && !isAuthenticated) {
        console.log('Access denied: Redirecting to login');
        return next('/login');
    }
    next();
});

export default router;


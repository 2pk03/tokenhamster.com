import { createRouter, createWebHistory } from 'vue-router';
import Login from '@/components/LoginPage.vue';
import Portfolio from '@/components/PortfolioPage.vue';

const routes = [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'Login', component: Login },
    { path: '/portfolio', name: 'Portfolio', component: Portfolio },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

// Add navigation guard
router.beforeEach((to, from, next) => {
    const publicPages = ['/login'];
    const token = localStorage.getItem('token');
    console.log(`Navigating to: ${to.path}, token: ${token}`); // Debug log
  
    if (!publicPages.includes(to.path) && !token) {
      return next('/login');
    }
  
    next();
  });  

export default router;

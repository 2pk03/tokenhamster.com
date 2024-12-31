// src/store/index.js

import { createStore } from 'vuex';
import auth from './auth'; // Assuming you have auth.js for authentication module

const store = createStore({
    modules: {
        auth, // Add other modules here as needed
    },
});

export default store;

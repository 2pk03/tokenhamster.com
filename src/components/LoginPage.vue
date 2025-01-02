<template>
  <div class="login-container">
    <div class="login-page">
      <center><h1>Token Hamster</h1></center>
      <button @click="initiateGoogleLogin" class="google-login-button">
        Login with Google
      </button>
    </div>
  </div>
</template>

<script>
import api from "@/api";
import { jwtDecode } from 'jwt-decode';

export default {
  name: "LoginPage",
  data() {
    return {
      username: "",
      password: "",
      error: "",
      googleClientId: process.env.VUE_APP_GOOGLE_CLIENT_ID,
    };
  },
  methods: {
    async login() {
      try {
        // Clear any previous token
        localStorage.removeItem('token');
        console.log("Attempting login with username:", this.username);
        console.log('Store state after login:', this.$store.state.auth);

        // Make API call for login
        const response = await api.post('/user/auth/login', {
          username: this.username,
          password: this.password,
        });

        const token = response.data.token;

        // Save token in localStorage
        localStorage.setItem('token', token);
        console.log("Token saved to localStorage");

        // Clear any previous error messages
        this.error = null;

        // Manually trigger isAuthenticated update (if needed)
        this.$store.commit('auth/setAuthenticated', true);

        // Redirect to portfolio page
        console.log("Redirecting to /portfolio");
        this.$router.push('/portfolio').catch((err) => {
          if (err.name !== 'NavigationDuplicated') {
            console.error("Navigation error:", err);
          }
        });
      } catch (err) {
        // Handle different error scenarios
        console.error("Login failed:", err.response ? err.response.data : err);

        if (err.response && err.response.status === 401) {
          this.error = 'Invalid username or password';
        } else if (err.response && err.response.status === 500) {
          this.error = 'Server error. Please try again later.';
        } else {
          this.error = 'An unexpected error occurred. Please try again.';
        }
      }
    },

   // Google Login
    initiateGoogleLogin() {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        console.error("Google Identity Services SDK is not ready.");
        this.error = "Google Login is not available at the moment. Please try again later.";
        return;
      }

      const clientId = this.googleClientId;
      console.log("Google Client ID:", clientId); // DEBUG
      console.log("Runtime Origin:", window.location.origin); // DEBUG

      try {
        // Ensure Google SDK is initialized properly
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => this.handleGoogleLogin(response.credential),
        });

        // Trigger the login UI
        window.google.accounts.id.prompt();
      } catch (error) {
        console.error("Error initializing Google Login:", error);
        this.error = "An error occurred during Google Login initialization.";
      }
    },

    async handleGoogleLogin(idToken) {
      try {
        const response = await api.post("/user/auth/google/validate", { idToken });
        const token = response.data.token;

        // Save token in localStorage
        localStorage.setItem("token", token);
        console.log("Google token saved to localStorage");

        // Set authentication state in Vuex
        this.$store.commit('auth/setToken', token);
        this.$store.commit('auth/setUser', jwtDecode(token));
        console.log("User authenticated and state updated");

        // Redirect to the portfolio page
        console.log("Redirecting to /portfolio");
        this.$router.push('/portfolio').catch((err) => {
          if (err.name !== 'NavigationDuplicated') {
            console.error("Navigation error:", err);
          }
        });
      } catch (err) {
        console.error("Error validating Google login:", err.response ? err.response.data : err);
        this.error = "Google login validation failed. Please try again.";
      }
    },
  }, 
};
</script>

<template>
  <div class="login-container">
    <div class="login-page">
      <h1>Login</h1>
      <form @submit.prevent="login">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" v-model="username" required />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" v-model="password" required />
        </div>
        <button type="submit">Login</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>

      <!-- Google Login Section -->
      <div class="google-login-section">
        <GoogleLogin :client-id="googleClientId" @success="handleGoogleLoginSuccess" @error="handleGoogleLoginError"
          class="google-login-button">
          Login with Google
        </GoogleLogin>
      </div>
    </div>
  </div>
</template>

<script>
import api from "@/api";
import { GoogleLogin } from 'vue3-google-login';

export default {
  name: "LoginPage",
  components: {
    GoogleLogin,
  },
  data() {
    return {
      username: '',
      password: '',
      error: '',
      googleClientId: process.env.VUE_APP_GOOGLE_CLIENT_ID,
    };
  },
  methods: {
    async login() {
      try {
        // Clear any previous token
        localStorage.removeItem('token');
        console.log("Attempting login with username:", this.username);

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

    // Google Login methods
    async handleGoogleLoginSuccess(response) {
      const idToken = response.credential;

      try {
        const backendResponse = await api.post('/user/auth/google/validate', { idToken });

        const token = backendResponse.data.token;

        // Save the token
        localStorage.setItem('token', token);

        console.log('Google login successful. Redirecting to /portfolio...');
        this.$router.push('/portfolio');
      } catch (error) {
        console.error('Google login failed:', error);

        if (error.response && error.response.status === 401) {
          this.error = 'Google login failed: Invalid token. Please try again.';
        } else {
          this.error = 'Google login failed. Please try again.';
        }
      }
    }
  },
  handleGoogleLoginError(error) {
    console.error("Google login error:", error);
    this.error = "Google login failed. Please try again.";
  },
};
</script>

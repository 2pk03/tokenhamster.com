<template>
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
  </div>
</template>

<script>
import api from "@/api";

export default {
  name: "LoginPage",
  data() {
    return {
      username: '',
      password: '',
      error: '',
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
        this.$store.dispatch('auth/setAuthenticated', true);

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
  },
};
</script>

<style scoped>
/* Styles remain unchanged */
.login-page {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  width: 100%;
  padding: 10px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}

.error {
  color: red;
  margin-top: 10px;
  text-align: center;
}
</style>

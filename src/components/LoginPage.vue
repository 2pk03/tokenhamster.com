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
      localStorage.removeItem('token'); // Clear stale token before login
      console.log("Attempting login with username:", this.username);
      const response = await api.post('/auth/login', {
        username: this.username,
        password: this.password,
      });
      console.log("Login successful:", response.data);

      const token = response.data.token;

      // Save token in localStorage
      localStorage.setItem('token', token);
      console.log("Token saved to localStorage");

      // Redirect to portfolio page
      this.$router.push('/portfolio');
    } catch (err) {
      console.error("Login failed:", err.response ? err.response.data : err);
      this.error = 'Invalid username or password';
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

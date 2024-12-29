<template>
  <div id="app">
    <!-- Global Menu -->
    <nav class="menu">
      <ul>
        <li class="portfolio-button-container">
          <router-link to="/portfolio" class="menu-button">Portfolio</router-link>
        </li>
        <li class="logout-button-container">
          <button class="logout-button" @click="logout">Logout</button>
        </li>
      </ul>
    </nav>

    <!-- Page Content -->
    <router-view />
  </div>
</template>

<script>
export default {
  name: "App",
    methods: {
    logout() {
      console.log("Logging out");
      localStorage.removeItem("token"); // Clear token from localStorage
      this.$router.push("/login"); // Redirect to login page
    },
  },
};
</script>

<style scoped>
/* Styling for the menu */
.menu {
  background-color: #333;
  color: white;
  padding: 10px;
}

.menu ul {
  list-style: none;
  display: flex;
  justify-content: flex-end; /* Align items to the right */
  align-items: center;
  margin: 0;
  padding: 0;
}

.menu ul li {
  display: inline-block;
}

.portfolio-button-container {
  margin-right: 50px; /* Add 50px space between Portfolio and Logout */
}

.menu-button {
  display: inline-block;
  padding: 10px 20px;
  background-color: #555;
  color: white;
  text-decoration: none;
  border: none;
  border-radius: 5px;
  text-align: center;
  cursor: pointer;
  font-size: 16px;
}

.menu-button:hover {
  background-color: #777;
}

.logout-button {
  padding: 10px 20px;
  background-color: #e63946;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
}

.logout-button:hover {
  background-color: #b71c1c;
}
</style>

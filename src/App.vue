<template>
  <div id="app">
    <!-- Global Menu -->
    <nav class="menu">
      <div class="menu-overview"></div>
      <ul>
        <li class="portfolio-button-container">
          <button class="menu-button add-token-button" @click="openAddTokenModal">+ Add Token</button>
        </li>
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

    <!-- Add Token Modal -->
    <div v-if="showAddTokenModal" class="modal-overlay" @keydown.esc="closeAddTokenModal" tabindex="0">
      <div class="modal">
        <button class="close-button" @click="closeAddTokenModal">✖</button>
        <h3>Add a Token</h3>
        <input
          v-model="searchQuery"
          placeholder="Search for a token..."
          @input="searchTokens"
          class="search-input"
        />
        <ul class="autocomplete-dropdown" v-if="searchResults.length">
          <li
            v-for="result in searchResults"
            :key="result.symbol"
            @click="selectToken(result)"
          >
            {{ result.full_name }}
          </li>
        </ul>
        <div v-if="selectedToken" class="token-details">
          <h4>Selected Token: {{ selectedToken.full_name }}</h4>
          <label>
            Purchase Date:
            <input type="date" v-model="purchaseDate" />
          </label>
          <label>
            Purchase Price:
            <input type="number" v-model="purchasePrice" placeholder="Enter price" />
          </label>
          <label>
            Amount Bought:
            <input type="number" v-model="amountBought" placeholder="Enter amount of crypto bought" />
          </label>
          <label>
            Currency:
            <select v-model="purchaseCurrency">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <button class="menu-button add-token-submit" @click="addTokenWithDetails">Add Token</button>
          <button class="cancel-button" @click="closeAddTokenModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from "@/api";
import EventBus from "@/eventBus";

export default {
  name: "App",
  data() {
    return {
      showTimeoutDialog: false,
      showAddTokenModal: false,
      searchQuery: "",
      searchResults: [],
      selectedToken: null,
      purchaseDate: null,
      purchasePrice: null,
      amountBought: null,
      purchaseCurrency: "USD",
    };
  },
  methods: {
    logout() {
      console.log("Logging out");
      localStorage.removeItem("token");
      this.$router.push("/login");
    },
    redirectToLogin() {
      this.showTimeoutDialog = false;
      this.logout();
    },
    handleSessionTimeout() {
      this.showTimeoutDialog = true;
    },
    openAddTokenModal() {
      this.showAddTokenModal = true;
    },
    closeAddTokenModal() {
      this.showAddTokenModal = false;
      this.resetTokenForm();
      EventBus.emit("refreshPortfolio"); // Emit the event to refresh portfolio
    },
    resetTokenForm() {
      this.searchQuery = "";
      this.searchResults = [];
      this.selectedToken = null;
      this.purchaseDate = null;
      this.purchasePrice = null;
      this.amountBought = null;
      this.purchaseCurrency = "USD";
    },
    async searchTokens() {
      if (!this.searchQuery) {
        this.searchResults = [];
        return;
      }
      try {
        const response = await api.get("/currency/supported", {
          params: { query: this.searchQuery },
        });
        this.searchResults = response.data;
      } catch (err) {
        console.error("Failed to search tokens:", err);
      }
    },
    selectToken(token) {
      this.selectedToken = token;
      this.searchQuery = "";
      this.searchResults = [];
    },
    async addTokenWithDetails() {
      if (!this.selectedToken || !this.purchaseDate || !this.purchasePrice || !this.amountBought) {
        alert("Please fill in all fields.");
        return;
      }
      try {
        const response = await api.post("/portfolio/add", {
          symbol: this.selectedToken.symbol,
          purchasePrice: parseFloat(this.purchasePrice),
          amount: parseFloat(this.amountBought),
          purchaseCurrency: this.purchaseCurrency,
          purchaseDate: this.purchaseDate,
        });

        if (response.status !== 200) {
          throw new Error("Unexpected response status");
        }

        alert("Token added successfully!");

        // Emit the event to update current prices
        EventBus.emit("updateCurrentPrices");

        // Reset form and close modal
        this.closeAddTokenModal();
      } catch (err) {
        console.error("Error while adding token:", err.message || err);
        alert("Failed to add token. Please try again.");
      }
    },
  },
  created() {
    window.addEventListener("sessionTimeout", this.handleSessionTimeout);
  },
  beforeUnmount() {
    window.removeEventListener("sessionTimeout", this.handleSessionTimeout);
  },
};
</script>

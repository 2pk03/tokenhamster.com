<template>
  <div id="app">
    <!-- Global Menu -->
    <nav class="menu" v-if="$route.path !== '/login'">
      <div class="menu-stats">
        <strong>Statistics:</strong>
        <span>Active Users: {{ activeUsers }}</span> | <span>Data Polled: {{ lastPoll }}</span>
      </div>
      <div class="menu-overview"></div>
      <ul>
        <li class="portfolio-button-container">
          <button class="menu-button add-token-button" @click="openAddTokenModal">+ Add Token</button>
        </li>
        <li class="portfolio-button-container">
          <router-link to="/portfolio"><button class="menu-button add-token-button">Portfolio</button></router-link>
        </li>
        <li class="menu-dropdown profile-container-menu">
          <img ref="profilePicture" :src="profilePictureUrl" alt="User Profile" class="profile-picture-menu"
            @click="toggleDropdown" />
          <ul class="dropdown-content" ref="dropdown" v-show="isDropdownOpen">
            <li>
              <router-link to="/account" class="menu-item">
                <span class="menu-icon">&gt;</span> Account
              </router-link>
            </li>
            <li>
              <router-link to="/profile" class="menu-item">
                <span class="menu-icon">&gt;</span> Profile
              </router-link>
            </li>
            <li>
              <span @click="logout" class="menu-item">
                <span class="menu-icon">&gt;</span> Logout
              </span>
            </li>
          </ul>
        </li>
      </ul>
    </nav>

    <!-- Page Content -->
    <router-view />

    <!-- Add Token Modal -->
    <div v-if="showAddTokenModal" class="add-token-modal-overlay">
      <div class="add-token-modal">
        <button class="close-button" @click="closeAddTokenModal">✖</button>
        <h3>Add a Token</h3>
        <input v-model="searchQuery" placeholder="Search for a token..." @input="searchTokens" class="search-input" />
        <ul class="autocomplete-dropdown" v-if="searchResults.length">
          <li v-for="result in searchResults" :key="result.symbol" @click="selectToken(result)">
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
          <button @click="addTokenWithDetails">Add Token</button><br>
          <button class="button-imp" @click="closeAddTokenModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getProfileImageUrl } from '@/api';
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
      isDropdownOpen: false,
      profilePictureUrl: "/logo.webp",
      activeUsers: 0,
      lastPoll: "N/A",
    };
  },
  methods: {
    logout() {
      // console.log("Logging out"); // DEBUG
      localStorage.removeItem("token");
      this.$router.push("/login");
    },
    toggleDropdown(event) {
      event.stopPropagation();
      this.isDropdownOpen = !this.isDropdownOpen;
    },
    closeDropdown(event) {
      const dropdown = this.$refs.dropdown;
      const profilePicture = this.$refs.profilePicture;
      if (dropdown && profilePicture && !dropdown.contains(event.target) && !profilePicture.contains(event.target)) {
        this.isDropdownOpen = false;
      }
    },
    async fetchActiveUsers() {
      try {
        const response = await api.get("/user/auth/active-users");
        this.activeUsers = response.data.count;
      } catch (error) {
        console.error("Error fetching active users:", error);
      }
    },
    async fetchLastPoll() {
      try {
        const response = await api.get("/functional/price/current");
        const lastUpdated = response.data.lastUpdated;

        if (!lastUpdated) {
          console.warn("No lastUpdated timestamp received.");
          this.lastPoll = "N/A";
          return;
        }
        const userLocale = navigator.language || 'en-UK';
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Malta';
        this.lastPoll = new Intl.DateTimeFormat(userLocale, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: userTimeZone,
        }).format(new Date(lastUpdated));
      } catch (error) {
        console.error("Error fetching last poll timestamp:", error);
        this.lastPoll = "N/A";
      }
    },
    openAddTokenModal() {
      this.showAddTokenModal = true;
    },
    closeAddTokenModal() {
      this.showAddTokenModal = false;
      this.resetTokenForm();
      EventBus.emit("refreshPortfolio");
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
        const response = await api.get("/functional/currency/supported", {
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
        const response = await api.post("/user/portfolio/add", {
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
    async fetchProfilePicture(userId) {
      try {
        const url = getProfileImageUrl(userId); // Construct URL
        const response = await api.get(url, { responseType: 'blob' }); // Fetch image as blob
        this.profilePictureUrl = URL.createObjectURL(response.data); // Create blob URL
      } catch (error) {
        console.error('Error fetching user image:', error);
      }
    },
    async loadUserImage() {
      try {
        // Fetch user profile to get userId
        const response = await api.get('/user/profile');
        const userId = response.data.id;
        if (userId) {
          this.fetchProfilePicture(userId);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    },
    created() {
      this.loadUserImage();
    },
    goToProfile() {
      this.$router.push("/profile");
    },
  },
  mounted() {
    this.loadUserImage();
    this.fetchActiveUsers();
    this.fetchLastPoll();
    EventBus.on("userLoggedIn", this.loadUserImage);

    // Refresh active users every minute
    setInterval(() => {
      this.fetchActiveUsers();
    }, 60000);

    document.addEventListener("click", this.closeDropdown);
  },
  beforeUnmount() {
    document.removeEventListener("click", this.closeDropdown);
    EventBus.off("userLoggedIn", this.loadUserProfile);
  },
};
</script>

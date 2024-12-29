<template>
  <div class="portfolio-page">
    <div class="content-container">
      <!-- Left Section: Graphs -->
      <div class="graphs-section">
        <h2>Price Trends</h2>
        <div class="graph-container">
          <canvas id="historicalGraph"></canvas>
        </div>
        <div class="graph-container">
          <canvas id="dailyGraph"></canvas>
        </div>
      </div>

      <!-- Right Section: Portfolio Table -->
      <div class="portfolio-section">
        <h2>Your Portfolio</h2>
        <div class="currency-selector">
          <label for="currency">Display Currency:</label>
          <select id="currency" v-model="currency" @change="updatePortfolioCurrency">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Date Bought</th>
              <th>Price Bought ({{ currency }})</th>
              <th>Current Price ({{ currency }})</th>
              <th>Win/Loss</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="token in portfolio" :key="token.symbol">
  <td>{{ token.symbol }}</td>
  <td>{{ token.purchaseDate }}</td>
  <td>{{ formatPrice (token.purchasePrice) }}</td>
  <td>{{ formatPrice(token.currentPrice) }}</td>
  <td :class="token.winLoss >= 0 ? 'win' : 'loss'">
    {{ formatPrice(token.winLoss) }}
  </td>
  <td>
    <button @click="confirmRemove(token)">Remove</button>
  </td>
</tr>
          </tbody>
        </table>

        <!-- Add Token Section -->
        <div class="add-token">
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

  <!-- Token Details -->
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
      Currency:
      <select v-model="purchaseCurrency">
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>
    </label>
    <button @click="addTokenWithDetails">Add Token</button>
  </div>
</div>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <div v-if="showDialog" class="confirmation-dialog">
      <div class="dialog-content">
        <p>Are you sure you want to remove {{ tokenToRemove.symbol }}?</p>
        <button @click="removeToken(tokenToRemove.symbol)">Yes, Remove</button>
        <button @click="closeDialog">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script>
import { Chart } from "chart.js";
import api from "@/api";

export default {
  name: "PortfolioPage",
  data() {
    return {
      portfolio: [],
      historicalData: [],
      pollingData: [],
      searchQuery: "",
      searchResults: [],
      selectedToken: null,
      showDialog: false, // For confirmation dialog
      tokenToRemove: null, // Token to remove after confirmation
      purchaseDate: null, // Date selector for purchase date
      purchasePrice: null, // Input for purchase price
      purchaseCurrency: "USD", // Dropdown for purchase currency
    };
  },
  methods: {
    // Fetch portfolio data
    async fetchPortfolioData() {
  try {
    const response = await api.get("/portfolio/fetch");
    this.portfolio = response.data.map((token) => ({
      ...token,
      currentPrice: null,
      purchasePriceConverted: null, // To store converted purchase price
      winLoss: null,
    }));
    console.log("Initial Portfolio:", this.portfolio);
    await this.updateCurrentPrices();
  } catch (err) {
    console.error("Failed to fetch portfolio data:", err);
    alert("Failed to fetch portfolio data. Please try again.");
    console.log("Portfolio Data:", this.portfolio);
  }
},

    // Search tokens
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
        console.log("Search results:", this.searchResults);
      } catch (err) {
        console.error("Failed to search for tokens:", err);
        alert("Failed to search for tokens. Please try again.");
      }
    },

    // Select token
    selectToken(token) {
      this.selectedToken = token;
    },

    // Add token with details
    async addTokenWithDetails() {
  if (!this.selectedToken || !this.purchaseDate || !this.purchasePrice || !this.purchaseCurrency) {
    alert("Please fill in all the details before adding the token.");
    return;
  }

  try {
    await api.post("/portfolio/add", {
      symbol: this.selectedToken.symbol,
      purchaseDate: this.purchaseDate,
      purchasePrice: parseFloat(this.purchasePrice),
      purchaseCurrency: this.purchaseCurrency,
    });

    // Add token to the portfolio
    this.portfolio.push({
      symbol: this.selectedToken.symbol,
      full_name: this.selectedToken.full_name,
      purchaseDate: this.purchaseDate,
      purchasePrice: parseFloat(this.purchasePrice),
      purchaseCurrency: this.purchaseCurrency,
      currentPrice: null,
      winLoss: null,
    });
    this.portfolio = [...this.portfolio];

    // Reset fields
    this.selectedToken = null;
    this.purchaseDate = null;
    this.purchasePrice = null;
    this.purchaseCurrency = "USD";
    this.searchQuery = "";
    this.searchResults = [];
    console.log("Token added with details:", this.portfolio);
  } catch (err) {
    console.error("Failed to add token:", err);
    alert("Failed to add token to portfolio. Please try again.");
  }
},

    // Fetch historical data
    async fetchHistoricalData() {
      for (const token of this.portfolio) {
        try {
          const response = await api.get("/historical/fetch", { params: { symbol: token.symbol } });
          this.historicalData = response.data;
          console.log(`Fetched historical data for ${token.symbol}:`, this.historicalData);
          this.renderHistoricalGraph(); // Render after fetching
        } catch (err) {
          console.error(`Failed to fetch historical data for ${token.symbol}:`, err);
        }
      }
    },

    // Fetch daily prices
    async fetchDailyPrices() {
      for (const token of this.portfolio) {
        try {
          const response = await api.get("/price/daily", { params: { symbol: token.symbol } });
          this.pollingData = response.data;
          console.log(`Fetched daily prices for ${token.symbol}:`, this.pollingData);
          this.renderDailyGraph(); // Render after fetching
        } catch (err) {
          console.error(`Failed to fetch daily prices for ${token.symbol}:`, err);
        }
      }
    },

    // Update current prices and calculate win/loss
    async updateCurrentPrices() {
  for (const token of this.portfolio) {
    try {
      // Fetch current price for the token
      const response = await api.get("/price/current", {
        params: { symbol: token.symbol },
      });
      
      // Update the token's current price
      token.currentPrice = response.data.price_usd;

      // Log the updated price for debugging
      console.log(`Current price for ${token.symbol}:`, token.currentPrice);

      // Calculate win/loss using the purchase price and converted purchase price
      const conversionResponse = await api.get("/price/convert", {
        params: {
          from: token.purchaseCurrency || "USD",
          to: this.currency,
          amount: token.purchasePrice,
        },
      });

      token.purchasePriceConverted = conversionResponse.data.convertedPrice;

      // Calculate win/loss
      token.winLoss = token.currentPrice - token.purchasePriceConverted;
    } catch (err) {
      console.error(`Failed to fetch current price for ${token.symbol}:`, err);
    }
  }
  // Trigger reactivity
  this.portfolio = [...this.portfolio];
  console.log("Updated Portfolio with Prices:", this.portfolio);
},

    // Format prices for display
    formatPrice(price) {
  console.log("Formatting price:", price); // Debugging log
  if (price === null || price === undefined) {
    return "--";
  }
  return parseFloat(price).toFixed(2);
},

    // Render historical graph
    renderHistoricalGraph() {
      if (!this.historicalData || this.historicalData.length === 0) {
        console.error("Historical data is not available for rendering.");
        return;
      }
      const ctx = document.getElementById("historicalGraph").getContext("2d");
      new Chart(ctx, {
        type: "line",
        data: {
          labels: this.historicalData.map((data) => data.date),
          datasets: [
            {
              label: "Price (USD)",
              data: this.historicalData.map((data) => data.price_usd),
              borderColor: "blue",
              fill: false,
            },
          ],
        },
      });
    },

    // Render daily price graph
    renderDailyGraph() {
      if (!this.pollingData || this.pollingData.length === 0) {
        console.error("Polling data is not available for rendering.");
        return;
      }
      const ctx = document.getElementById("dailyGraph").getContext("2d");
      new Chart(ctx, {
        type: "line",
        data: {
          labels: this.pollingData.map((data) => data.date),
          datasets: [
            {
              label: "Daily Prices",
              data: this.pollingData.map((data) => data.price),
              borderColor: "green",
              fill: false,
            },
          ],
        },
      });
    },

    // Update portfolio currency
    
    async updatePortfolioCurrency() {
  for (const token of this.portfolio) {
    try {
      const response = await api.get("/price/convert", {
        params: {
          from: token.purchaseCurrency || "USD",
          to: this.currency,
          amount: token.purchasePrice,
        },
      });
      token.purchasePriceConverted = response.data.convertedPrice;

      // Recalculate win/loss
      token.winLoss = token.currentPrice - token.purchasePriceConverted;
    } catch (err) {
      console.error(`Failed to convert price for ${token.symbol}:`, err);
    }
  }
  this.portfolio = [...this.portfolio];
  console.log("Portfolio updated for new currency:", this.portfolio);
},

    // Remove a token
    async removeToken(symbol) {
      try {
        await api.post("/portfolio/remove", { symbol });
        this.portfolio = this.portfolio.filter((token) => token.symbol !== symbol);
        this.portfolio = [...this.portfolio];
        console.log("Token removed:", symbol);
      } catch (err) {
        console.error("Failed to remove token:", err);
        alert("Failed to remove token. Please try again.");
      } finally {
        this.closeDialog();
      }
    },

    // Close dialog
    closeDialog() {
      this.showDialog = false;
      this.tokenToRemove = null;
    },
  },
  created() {
  const token = localStorage.getItem("token");
  if (!token) {
    this.$router.push("/login");
  } else {
    this.fetchPortfolioData().then(() => {
      this.updateCurrentPrices(); // Trigger the update for current prices
      this.fetchHistoricalData();
      this.fetchDailyPrices();
    });
  }
},
};
</script>

<style scoped>
.confirmation-dialog {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center; /* Ensures the dialog is vertically centered */
  z-index: 1000;
}

.dialog-content {
  background: #fff;
  padding: var(--spacing-large);
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  max-width: 400px; /* Optional: limit the dialog's width */
  width: 90%; /* Optional: ensure responsiveness on smaller screens */
}

.add-token {
  margin-top: 20px;
}

.search-input {
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.autocomplete-dropdown {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  max-height: 200px;
  overflow-y: auto;
}

.autocomplete-dropdown li {
  padding: 10px;
  cursor: pointer;
  background: #f9f9f9;
}

.autocomplete-dropdown li:hover {
  background: #e9e9e9;
}

.content-container {
  display: flex;
  gap: 20px;
}

.graphs-section {
  flex: 7;
}

.portfolio-section {
  flex: 3;
}

.currency-selector {
  margin-bottom: 20px;
}

.portfolio-table th,
.portfolio-table td {
  border: 1px solid var(--border-color);
  padding: 10px;
  text-align: left;
}

.win {
  color: green;
}

.loss {
  color: red;
}
</style>

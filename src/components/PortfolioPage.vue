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
        <h2>
          Your Portfolio's Value:
          <span :class="{ positive: totalValue >= 0, negative: totalValue < 0 }">
            {{ formattedTotalValue }}
          </span>
        </h2>
        <p class="portfolio-change" :class="{ positive: percentageChange > 0, negative: percentageChange < 0 }">
          {{ percentageChange.toFixed(2) }}%
        </p>
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Date Bought</th>
              <th>Amount Bought</th>
              <th>Price Bought</th>
              <th>Current Price</th>
              <th>Win/Loss</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="token in portfolio" :key="token.symbol">
              <td>{{ token.symbol }}</td>
              <td>{{ token.purchaseDate }}</td>
              <td>{{ token.amountBought }}</td>
              <td>{{ formatFullPrice(token.purchasePrice) }} ({{ token.purchaseCurrency }})</td>
              <td>{{ formatFullPrice(token.currentPriceConverted || token.currentPrice) }}</td>
              <td :class="token.winLoss >= 0 ? 'win' : 'loss'">
                {{ formatPrice(token.winLoss) }}
              </td>
              <td>
                <button class="remove-button" @click="confirmRemove(token)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <div v-if="showDialog" class="confirmation-dialog">
      <div class="dialog-content">
        <p>Are you sure you want to remove {{ tokenToRemove.symbol }}?</p>
        <button class="yes-remove-button" @click="removeToken(tokenToRemove.symbol)">Yes, Remove</button>
        <button class="cancel-button" @click="closeDialog">Cancel</button>
      </div>
    </div>
  </div>
</template>


<script>
import { Chart } from "chart.js";
import api from "@/api";
import EventBus from "@/eventBus";

export default {
  name: "PortfolioPage",
  data() {
    return {
      portfolio: [],
      totalValue: 0,
      percentageChange: 0,
      historicalData: [],
      pollingData: [],
      searchQuery: "",
      searchResults: [],
      selectedToken: null,
      showDialog: false,
      tokenToRemove: null,
      purchaseDate: null,
      purchasePrice: null,
      purchaseCurrency: "USD",
      pollingInterval: null,
    };
  },
  computed: {
    formattedTotalValue() {
      return this.totalValue.toLocaleString(undefined, {
        style: "currency",
        currency: "EUR",
      });
    },
  },
  methods: {
    // polling
    startPolling() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval); // Clear any existing interval
      }
      this.pollingInterval = setInterval(async () => {
        await this.updateCurrentPrices(); // Fetch updated prices
      }, 30000); // Poll every 30 seconds
    },
    stopPolling() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    },

    async fetchPortfolioData() {
      try {
        const response = await api.get("/user/portfolio/fetch");
        this.portfolio = response.data.map((token) => ({
          ...token,
          currentPrice: null,
          winLoss: null,
        }));
        console.log("Portfolio fetched:", this.portfolio);

        // Fetch current prices
        await this.updateCurrentPrices();

        // Calculate total value and percentage change
        this.calculateTotalValue();
      } catch (err) {
        console.error("Failed to fetch portfolio data:", err.message);
      }
    },
    calculateTotalValue() {
  let totalPurchaseValue = 0;
  let totalCurrentValue = 0;

  // Calculate purchase value and current value for each token
  this.portfolio.forEach((token) => {
    const purchaseValue = (token.amountBought || 0) * (token.purchasePrice || 0);
    const currentValue = (token.amountBought || 0) * (token.currentPrice || 0);

    totalPurchaseValue += purchaseValue;
    totalCurrentValue += currentValue;
  });

  this.totalValue = totalCurrentValue;

  // Calculate percentage change
  this.percentageChange = totalPurchaseValue
    ? ((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100
    : 0;
  },
    // Fetch historical data
    async fetchHistoricalData() {
      for (const token of this.portfolio) {
        try {
          const response = await api.get("/functional/historical/fetch", {
            params: { symbol: token.symbol },
          });
          this.historicalData = response.data;
          console.log(
            `Fetched historical data for ${token.symbol}:`,
            this.historicalData
          );
          this.renderHistoricalGraph(); // Render after fetching
        } catch (err) {
          console.error(
            `Failed to fetch historical data for ${token.symbol}:`,
            err
          );
        }
      }
    },

    // Fetch daily prices
    async fetchDailyPrices() {
      for (const token of this.portfolio) {
        try {
          const response = await api.get("/functional/price/daily", {
            params: { symbol: token.symbol },
          });
          this.pollingData = response.data;
          console.log(
            `Fetched daily prices for ${token.symbol}:`,
            this.pollingData
          );
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
          const response = await api.get("/functional/price/current", {
            params: { cryptoSymbol: token.symbol, currency: token.purchaseCurrency },
          });

          // Update current price
          token.currentPrice = response.data.price;

          const totalPurchaseValue = token.purchasePrice * token.amountBought;
          const currentTotalValue = token.currentPrice * token.amountBought;

          // Calculate win/loss
          token.winLoss = currentTotalValue - totalPurchaseValue;

          console.log(`Updated data for ${token.symbol}:`, {
            totalPurchaseValue,
            currentTotalValue,
            winLoss: token.winLoss,
          });
        } catch (err) {
          console.error(`Failed to fetch current price for ${token.symbol}:`, err);
        }
      }

      // Trigger reactivity update
      this.portfolio = [...this.portfolio];
      console.log("Portfolio updated with new prices and timestamps:", this.portfolio);
    },

    // Format prices for display
    formatPrice(price) {
      if (price === null || price === undefined) {
        return "--";
      }
      return parseFloat(price).toFixed(2); // Format to two decimal places
    },

    formatFullPrice(price) {
      if (price === null || price === undefined) {
        return "--";
      }
      return parseFloat(price).toFixed(6);
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
          if (token.purchaseCurrency === this.currency) {
            token.purchasePriceConverted = token.purchasePrice;
          } else {
            const purchaseConversionResponse = await api.get("/functional/price/convert", {
              params: {
                from: token.purchaseCurrency,
                to: this.currency,
                amount: token.purchasePrice,
              },
            });
            token.purchasePriceConverted =
              purchaseConversionResponse.data.convertedAmount;
          }

          if (this.currency === "USD") {
            token.currentPriceConverted = token.currentPrice;
          } else {
            const currentPriceConversionResponse = await api.get(
              "/price/convert",
              {
                params: {
                  from: "USD",
                  to: this.currency,
                  amount: token.currentPrice,
                },
              }
            );
            token.currentPriceConverted =
              currentPriceConversionResponse.data.convertedAmount;
          }

          token.winLoss =
            token.currentPrice * token.amount -
            token.purchasePrice * token.amount;

          console.log(`Updated prices for ${token.symbol}:`, {
            purchasePriceConverted: token.purchasePriceConverted,
            currentPriceConverted: token.currentPriceConverted,
            winLoss: token.winLoss,
          });
        } catch (err) {
          console.error(`Failed to update currency for ${token.symbol}:`, err);
        }
      }

      this.portfolio = [...this.portfolio];
      console.log("Portfolio updated with currency conversion:", this.portfolio);
    },

    // Format timestamp
    formatLastPolled(timestamp) {
      if (!timestamp || timestamp === "--") {
        return "--";
      }

      try {
        // Ensure the timestamp is treated as UTC
        const date = new Date(`${timestamp}Z`);
        return new Intl.DateTimeFormat(navigator.language, {
          dateStyle: "short", // Short date format
          timeStyle: "short", // Short time format
        }).format(date);
      } catch (err) {
        console.error("Error formatting timestamp:", err);
        return "--";
      }
    },

    // Remove a token
    async removeToken(symbol) {
      try {
        await api.post("/user/portfolio/token/remove", { symbol });
        this.portfolio = this.portfolio.filter((token) => token.symbol !== symbol); // Remove token locally
        console.log("Token removed:", symbol);

        // Emit the refreshPortfolio event
        EventBus.emit("refreshPortfolio");
      } catch (err) {
        console.error("Failed to remove token:", err);
        alert("Failed to remove token. Please try again.");
      } finally {
        this.closeDialog(); // Ensure the dialog closes
      }
    },

    // Confirm token removal
    confirmRemove(token) {
      this.tokenToRemove = token; // Set the token to be removed
      this.showDialog = true; // Open the confirmation dialog
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
        this.updateCurrentPrices();
        this.startPolling();
      });
    }
  },
  mounted() {
    // Register EventBus listener
    EventBus.on("updateCurrentPrices", this.updateCurrentPrices);
    EventBus.on("refreshPortfolio", this.fetchPortfolioData); // Ensure portfolio refresh
  },
  bbeforeUnmount() {
    // Unregister EventBus listeners
    EventBus.off("updateCurrentPrices", this.updateCurrentPrices);
    EventBus.off("refreshPortfolio", this.fetchPortfolioData);
  },
};
</script>
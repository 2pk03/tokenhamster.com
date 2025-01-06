<template>
  <div class="content-container">
    <!-- Left Section: Graphs -->
    <div class="graphs-section">
      <h2>Price Trends</h2>

      <!-- Historical Graph -->
      <div class="graph-container">
        <apexchart type="line" :options="historicalChartOptions" :series="historicalChartSeries"></apexchart>
      </div>

      <!-- Daily Graph -->
      <div class="graph-container">
        <apexchart type="bar" :options="dailyChartOptions" :series="dailyChartSeries"></apexchart>
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
      <div class="overview-section">
        <div class="overview-metrics">
          <span class="overview-invest">Total Invest:</span>{{ formatNumber(totalInvest) }}
          <span class="overview-invest">Performance:</span><span class="overview-performance"
            :class="percentageChange >= 0 ? 'win' : 'loss'"> {{
              percentageChange.toFixed(2) }}%</span>
        </div>
      </div>
      <table class="portfolio-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Date</th>
            <th>Cost</th>
            <th>Amount</th>
            <th>Total</th>
            <th>Current</th>
            <th>Sum</th>
            <th>Perf</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in portfolio" :key="token.symbol">
            <td>{{ token.symbol }}</td>
            <td>{{ formatDateEU(token.purchaseDate) }}</td>
            <td>{{ (token.purchasePrice) }} ({{ token.purchaseCurrency }})</td>
            <td>{{ formatCompactAmount(token.amountBought) }}</td>
            <td>{{ formatNumber(token.amountBought * token.purchasePrice) }}</td>
            <td>{{ formatFullPrice(token.currentPriceConverted || token.currentPrice) }}</td>
            <td
              :class="(token.amountBought * (token.currentPriceConverted || token.currentPrice)) >= (token.amountBought * token.purchasePrice) ? 'win' : 'loss'">
              {{ formatNumber(token.amountBought * (token.currentPriceConverted || token.currentPrice)) }}
            </td>
            <td :class="token.winLoss >= 0 ? 'win' : 'loss'">
              {{ formatPrice(((token.amountBought * (token.currentPriceConverted || token.currentPrice)) -
                (token.amountBought * token.purchasePrice)) / (token.amountBought * token.purchasePrice) * 100) }}%
            </td>
            <td>
              <button class="button-small-imp" @click="confirmRemove(token)">Delete</button>
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
      <button class="button-imp" @click="removeToken(tokenToRemove.symbol)">Yes, Remove</button>
      <button class="button" @click="closeDialog">Cancel</button>
    </div>
  </div>
</template>

<script>
import api from "@/api";
import EventBus from "@/eventBus";
import VueApexCharts from "vue3-apexcharts";

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

      // ApexChart options and series
      historicalChartOptions: {
        chart: {
          type: "line",
          zoom: { enabled: true },
          toolbar: { show: false }, // Removes unnecessary toolbar
          offsetX: 10, // Adds padding to prevent clipping
          offsetY: 10,
        },
        xaxis: {
          type: "datetime",
          title: {
            text: "Date",
            style: { fontSize: "12px", color: "#333" }, // Ensure title is visible
          },
          labels: {
            rotate: -45, // Rotates labels to save space
            style: { fontSize: "10px", color: "#333" }, // Adjust label font
          },
        },
        yaxis: {
          title: {
            text: "Price (USD)",
            style: { fontSize: "12px", color: "#333" },
          },
          labels: {
            formatter: (value) => `$${value.toFixed(2)}`,
            style: { fontSize: "10px", color: "#333" },
          },
        },
        tooltip: {
          x: { format: "dd MMM yyyy" },
          y: { formatter: (value) => `$${value.toFixed(2)}` },
        },
      },
      historicalChartSeries: [
        { name: "Price", data: [] }, // Data to be populated dynamically
      ],

      dailyChartOptions: {
        chart: {
          type: "bar",
          toolbar: { show: false },
          offsetX: 10,
          offsetY: 10,
        },
        xaxis: {
          type: "datetime",
          title: {
            text: "Date",
            style: { fontSize: "12px", color: "#333" },
          },
          labels: {
            rotate: -45,
            style: { fontSize: "10px", color: "#333" },
          },
        },
        yaxis: {
          title: {
            text: "Volume (USD)",
            style: { fontSize: "12px", color: "#333" },
          },
          labels: {
            formatter: (value) => `$${value.toFixed(2)}`,
            style: { fontSize: "10px", color: "#333" },
          },
        },
        tooltip: {
          x: { format: "dd MMM yyyy" },
          y: { formatter: (value) => `$${value.toFixed(2)}` },
        },
      },
      dailyChartSeries: [
        { name: "Daily Volume", data: [] }, // Data to be populated dynamically
      ],
    };
  },
  components: {
    apexchart: VueApexCharts,
  },
  computed: {
    formattedTotalValue() {
      return this.totalValue.toLocaleString(undefined, {
        style: "currency",
        currency: "EUR",
      });
    },
    totalInvest() {
      return this.portfolio.reduce((sum, token) => sum + (token.amountBought * token.purchasePrice), 0);
    },
    totalSum() {
      return this.portfolio.reduce((sum, token) => sum + (token.amountBought * (token.currentPriceConverted || token.currentPrice)), 0);
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
        // console.log("Portfolio fetched:", this.portfolio); // DEBUG

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
    async fetchHistoricalData(symbol) {
      try {
        const response = await api.get(`/functional/historical/fetch`, {
          params: { symbol },
        });
        this.historicalChartSeries[0].data = response.data.map((d) => [
          new Date(d.date_time).getTime(),
          d.price_usd,
        ]);
      } catch (err) {
        console.error("Failed to fetch historical data:", err.message);
      }
    },

    // Fetch daily prices
    async fetchDailyData(symbol) {
      try {
        // console.log(`Fetching daily data for: ${symbol}`); // DEBUG
        const response = await api.get(`/daily/fetch`, { params: { symbol } });
        // console.log("API Response for daily data:", response.data); // DEBUG

        // Ensure response.data is an array before mapping
        if (!Array.isArray(response.data)) {
          throw new Error("Expected an array, but received: " + typeof response.data);
        }

        this.dailyChartSeries[0].data = response.data.map((d) => [
          new Date(d.date_time).getTime(),
          d.volume,
        ]);
        console.log("Daily data successfully mapped:", this.dailyChartSeries[0].data);
      } catch (err) {
        console.error("Failed to fetch daily data:", err.message);
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

           /* console.log(`Updated data for ${token.symbol}:`, {
            totalPurchaseValue,
            currentTotalValue,
            winLoss: token.winLoss,
          }); */
        } catch (err) {
          console.error(`Failed to fetch current price for ${token.symbol}:`, err);
        }
      }

      // Trigger reactivity update
      this.portfolio = [...this.portfolio];
      // console.log("Portfolio updated with new prices and timestamps:", this.portfolio); // DEBUG
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
      return price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
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
      // console.log("Portfolio updated with currency conversion:", this.portfolio); // DEBUG
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
        // console.log("Token removed:", symbol); // DEBUG

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
    formatDateEU(date) {
      return new Date(date).toLocaleDateString('de-DE');
    },
    formatAmount(amount) {
      return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    formatCompactAmount(amount) {
      if (amount >= 1_000_000) {
        return (amount / 1_000_000).toFixed(1) + 'M';
      } else if (amount >= 1_000) {
        return (amount / 1_000).toFixed(1) + 'K';
      }
      return amount.toFixed(2);
    },
    formatNumber(value) {
      return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    EventBus.on("refreshPortfolio", this.fetchPortfolioData);
    const defaultToken = "XRP";
    this.fetchHistoricalData(defaultToken);
    this.fetchDailyData(defaultToken);
  },
  bbeforeUnmount() {
    // Unregister EventBus listeners
    EventBus.off("updateCurrentPrices", this.updateCurrentPrices);
    EventBus.off("refreshPortfolio", this.fetchPortfolioData);
  },
};
</script>
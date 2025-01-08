<template>
  <div class="content-container">
    <!-- Left Section: Graphs -->
    <div class="graphs-section">
      <div class="performance-header">
        <h2>Portfolio Performance
          <label for="currency-select" class="currency-label">in:</label>
        </h2>
        <select id="currency-select" v-model="selectedCurrency" @change="fetchPortfolioChartData">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      <!-- Portfolio Value Chart -->
      <div class="chart-container">
        <apexchart type="line" :options="updatedChartOptions" :series="portfolioChartSeries" height="300"></apexchart>
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
          <span class="overview-invest">Invest:</span><b>{{ formatNumber(totalInvest) }}</b>
          <span class="overview-invest">Perf:</span><span class="overview-performance"
            :class="percentageChange >= 0 ? 'win' : 'loss'"> {{
              percentageChange.toFixed(2) }}%</span>
          <span class="overview-invest">W/L:</span><span class="overview-performance" :class="totalWinLoss >= 0 ? 'win' : 'loss'">
            {{ totalWinLoss >= 0 ? '+' : '' }}{{ formattedTotalWinLoss }}
        </span>
          <span class="overview-invest">Daily W/L:</span><span class="overview-performance"
            :class="dailyDifference >= 0 ? 'win' : 'loss'">
            {{ dailyDifference >= 0 ? '+' : '' }}{{ formatNumber(dailyDifference) }}
          </span>
        </div>
      </div>
      <table class="portfolio-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Invest</th>
            <th>W/L</th>
            <th>Perf</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in portfolio" :key="token.symbol">
            <td>{{ token.symbol }}<br>
             [{{ formatDateEU(token.purchaseDate) }}]</td>
            <td>{{ formatCompactAmount(token.amountBought) }}<br>
            [{{ (token.purchasePrice) }} ({{ token.purchaseCurrency }})]</td>
            <td> <span :class="(token.amountBought * (token.currentPriceConverted || token.currentPrice)) >= (token.amountBought * token.purchasePrice) ? 'win' : 'loss'">
              {{ formatNumber(token.amountBought * (token.currentPriceConverted || token.currentPrice)) }} </span><br>
              [{{ formatNumber(token.amountBought * token.purchasePrice) }}] </td>
            <td><span :class="token.winLoss >= 0 ? 'win' : 'loss'">
              {{ formatPrice(((token.amountBought * (token.currentPriceConverted || token.currentPrice)) -
                (token.amountBought * token.purchasePrice)) / (token.amountBought * token.purchasePrice) * 100) }}%</span><br>
                [{{ formatFullPrice(token.currentPriceConverted || token.currentPrice) }}]</td>
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
      availableCurrencies: ["EUR", "USD"],
      portfolioChartData: [],
      preferredCurrency: 'EUR',
      selectedCurrency: 'EUR',
      currencyError: 'N/A',
      dailyDifference: 0,
      totalSum: 0,

      // ApexChart options and series
      portfolioChartOptions: {
        chart: {
          type: "line",
          zoom: { enabled: true },
          toolbar: { show: false },
          offsetX: 10,
          offsetY: 10,
        },
        stroke: {
          curve: "smooth",
          width: 3,
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
            text: "Value (USD)",
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
      PortfolioChartSeries: [
        { name: "Value", data: [] }, // Data to be populated dynamically
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
        currency: this.selectedCurrency || "EUR",
      });
    },
    totalInvest() {
      if (!Array.isArray(this.portfolio) || this.portfolio.length === 0) {
        return 0;
      }
      return this.portfolio.reduce((sum, token) =>
        sum + (token.amountBought * token.purchasePrice), 0
      );
    },
    totalWinLoss() {
        const totalSum = this.totalValue || 0;
        const totalInvest = this.totalInvest || 0;
        return totalSum - totalInvest;
    },
    formattedTotalWinLoss() {
        return this.formatNumber(this.totalWinLoss);
    },
    portfolioChartSeries() {
      return [
        {
          name: `Portfolio Value (${this.selectedCurrency || "N/A"})`,
          data: this.portfolioChartData.map((point) => [
            new Date(point.timestamp).getTime(),
            point.value,
          ]),
        },
      ];
    },
    updatedChartOptions() {
      const currencySymbol = this.selectedCurrency === "USD" ? "$" : "€";
      return {
        ...this.portfolioChartOptions,
        tooltip: {
          x: {
            formatter: (value) => this.formatDateTime(value),
          },
          y: {
            formatter: (value) => `${currencySymbol}${value.toFixed(2)}`,
          },
        },
        yaxis: {
          ...this.portfolioChartOptions.yaxis,
          title: {
            text: `Value (${this.selectedCurrency})`, // Update the y-axis title dynamically
          },
          labels: {
            formatter: (value) => `${currencySymbol}${value.toFixed(2)}`, // Dynamic label formatter
          },
        },
      };
    },
  },
  watch: {
    selectedCurrency(newCurrency) {
      // console.log(`Currency changed to: ${newCurrency}`); // DEBUG
      this.fetchCurrencyValue(newCurrency);
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

    async fetchPreferredCurrency() {
      try {
        const response = await api.get('/user/profile/currency');
        this.preferredCurrency = response.data.preferred_currency || "EUR";
        // console.log(`Preferred currency set to: ${this.preferredCurrency}`); // DEBUG
      } catch (error) {
        console.error("Error fetching preferred currency:", error.message);
        this.preferredCurrency = "EUR";
      }
    },

    async fetchCurrencyValue(currency) {
      try {
        // console.log(`Fetching total value for currency: ${currency}`); // DEBUG

        const response = await api.get(`/user/portfolio/perf/data`, {
          params: {
            latest: true,
            currency,
          },
        });

        this.totalValue = response.data?.value || 0;
        // console.log(`Total value updated to: ${this.totalValue}`); // DEBUG
      } catch (error) {
        console.error("Error fetching total value:", error.response?.data || error.message);
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

    async calculateTotalValue() {
      try {
        const response = await api.get('/user/portfolio/perf/data', {
          params: { currency: 'EUR', latest: true },
        });

        // Set totalValue from the latest API response
        this.totalValue = response.data?.value || 0;

        // Calculate percentageChange dynamically
        this.percentageChange = this.totalInvest > 0
          ? ((this.totalValue - this.totalInvest) / this.totalInvest) * 100
          : 0;
      } catch (error) {
        console.error('Failed to fetch total portfolio value:', error.message);
        this.totalValue = 0;
        this.percentageChange = 0;
      }
    },

    // daily perf
    async fetchDailyWinLoss() {
      try {
        const response = await api.get('/user/portfolio/perf/daily', {
          params: { currency: this.selectedCurrency },
        });

        this.dailyDifference = response.data.dailyDifference || 0;

        console.log('Daily W/L fetched:', {
          dailyDifference: this.dailyDifference,
          lastYesterdayValue: response.data.lastYesterdayValue,
          latestTodayValue: response.data.latestTodayValue,
        });
      } catch (err) {
        console.error('Failed to fetch daily W/L:', err.response?.data || err.message);
        this.dailyDifference = 0;
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
        // console.log("Daily data successfully mapped:", this.dailyChartSeries[0].data);
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

          /* console.log(`Updated prices for ${token.symbol}:`, {
            purchasePriceConverted: token.purchasePriceConverted,
            currentPriceConverted: token.currentPriceConverted,
            winLoss: token.winLoss,
          }); */ // DEBUG
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

    /* Chart logic */

    // 1. Initialize portfolio and fetch chart data
    async initPortfolioData() {
      try {
        await this.fetchPreferredCurrency();
        this.selectedCurrency = this.preferredCurrency;
        const response = await api.get("/user/portfolio/fetch");
        if (response.data.length > 0) {
          // console.log("Portfolio fetched:", response.data); // DEBUG

          // Set portfolio data for table
          this.portfolio = response.data.map((token) => ({
            ...token,
            currentPrice: null,
            winLoss: null,
          }));

          // Fetch chart data
          await this.fetchPortfolioChartData();
        } else {
          console.warn("No portfolios available for the user.");
          this.portfolio = [];
        }
      } catch (error) {
        console.error("Error initializing portfolio:", error.message);
        this.portfolio = [];
      }
    },

    // 2. Fetch chart data for the active portfolio
    async fetchPortfolioChartData() {
      try {
        // console.log(`Fetching chart data for currency: ${this.selectedCurrency}`); // DEBUG

        const response = await api.get(`/user/portfolio/perf/data`, {
          params: {
            startDate: '1970-01-01',
            endDate: new Date().toISOString(),
            currency: this.selectedCurrency,
          },
        });

        if (!response.data || Object.keys(response.data).length === 0) {
          console.warn(`No chart data found for currency: ${this.selectedCurrency}`);
          this.portfolioChartData = [];
          return;
        }

        // console.log(`Chart data fetched for ${this.selectedCurrency}:`, response.data); // DEBUG
        this.updateChart(response.data); // Update the chart with the fetched data
      } catch (error) {
        console.error(
          "Error fetching portfolio chart data:",
          error.response?.data || error.message
        );
      }
    },

    // 3. Update chart data for the selected currency
    updateChart(data) {
      if (!data || !this.selectedCurrency) {
        console.warn("No chart data or currency selected.");
        this.portfolioChartData = [];
        return;
      }

      const currencyData = data[this.selectedCurrency];
      if (currencyData?.length > 0) {
        this.portfolioChartData = currencyData;
        // console.log(`Chart updated for ${this.selectedCurrency}:`, this.portfolioChartData); // DEBUG
      } else {
        console.warn(`No data available for currency: ${this.selectedCurrency}`);
        this.portfolioChartData = [];
      }
    },
    /* timezone stuff */
    formatDateTime(timestamp) {
      const date = new Date(timestamp);

      // Check if the selected currency is USD or EUR
      if (this.selectedCurrency === "USD") {
        // 12-hour format with timezone
        return date.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/New_York", // Adjust to US timezone
        });
      } else {
        // 24-hour format with timezone
        return date.toLocaleString("de-DE", {
          dateStyle: "medium",
          timeStyle: "short",
          hour12: false, // 24-hour format
          timeZone: "Europe/Berlin", // Adjust to EU timezone
        });
      }
    },
  },
  /* method block end */

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
    // Register EventBus listeners
    EventBus.on("updateCurrentPrices", this.updateCurrentPrices);
    EventBus.on("refreshPortfolio", this.fetchPortfolioData);
    this.fetchDailyWinLoss();

    // Fetch portfolio data and initialize chart
    this.initPortfolioData();

    // Set up the selected currency and fetch the initial total value
    this.fetchPreferredCurrency()
      .then(() => {
        this.selectedCurrency = this.preferredCurrency;
        return this.fetchCurrencyValue(this.selectedCurrency);
      })
      .catch((error) => {
        console.error("Error during currency initialization:", error.message);
      });

    // check for token and push => /
    this.refreshInterval = setInterval(() => {
      this.fetchPortfolioData();
    }, 60000); // Refresh every 60 seconds
  },

  beforeUnmount() {
    // Unregister EventBus listeners
    EventBus.off("updateCurrentPrices", this.updateCurrentPrices);
    EventBus.off("refreshPortfolio", this.fetchPortfolioData);
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval); // Clear the interval on component unmount
    }
  },

};

</script>
<style scoped>
.performance-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.currency-label {
  margin: 0;
}

select {
  font-size: 1rem;
  max-width: 75px;
  margin-top: -5px;
}
</style>
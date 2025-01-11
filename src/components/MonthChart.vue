<template>
    <div class="portfolio-container">
        <!-- Last 30 Days Chart -->
        <div class="graph-container">
            <div class="graphs-box">
                <h2>Last 30 Days</h2>

                <!-- Dropdown for Selecting Tokens -->
                <div class="chart-controls">
                    <label for="crypto-select-30days">Select a Token:</label>
                    <select id="crypto-select-30days" :value="selectedToken"
                        @input="$emit('update:selectedToken', $event.target.value)" @change="fetchPriceData">
                        <option v-for="token in tokens" :key="token" :value="token">
                            {{ token }}
                        </option>
                    </select>

                    <!-- Checkboxes for Time Windows -->
                    <div class="time-window-controls"
                        style="display: inline-flex; align-items: center; margin-left: 40px;">
                        <label style="margin-right: 10px;">
                            <input type="radio" value="24h" v-model="selectedTimeWindow" @change="fetchPriceData" />
                            24h
                        </label>
                        <label style="margin-right: 10px;">
                            <input type="radio" value="week" v-model="selectedTimeWindow" @change="fetchPriceData" />
                            1 Week
                        </label>
                        <label>
                            <input type="radio" value="month" v-model="selectedTimeWindow" @change="fetchPriceData" />
                            30 Days
                        </label>
                    </div>
                </div>

                <!-- ApexCharts Rendering -->
                <div class="chart-render">
                    <apexchart :type="last30DaysChartOptions.chart.type" :height="last30DaysChartOptions.chart.height"
                        :options="last30DaysChartOptions" :series="last30DaysChartSeries" />
                </div>
                <!-- Chart Type Selection -->
                <div class="chart-type-controls">
                    <label>
                        <input type="radio" value="price" v-model="selectedChartType" @change="fetchPriceData" />
                        Price
                    </label>
                    <label>
                        <input type="radio" value="candlestick" v-model="selectedChartType" @change="fetchPriceData" />
                        Candlestick
                    </label>
                </div>
            </div>
        </div>
    </div>

</template>

<script>
import api from "@/api";
import EventBus from "@/services/eventBus";
import VueApexCharts from "vue3-apexcharts";

export default {
    name: "MonthChart",
    data() {
        return {
            last30DaysChartData: [],
            selectedChartType: "price",
            tokens: [],
            selectedTimeWindow: "24h",

            // ApexChart options and series
            last30DaysChartSeries: [
                {
                    name: "Price",
                    data: [], // Ensure an empty array is provided
                },
            ],
            last30DaysChartOptions: {
                chart: {
                    height: 400,
                    type: "line",
                    stacked: false, // Ensure no stacking by default
                    width: 2,
                },
                stroke: {
                    curve: "straight",
                    width: 2,
                    colors: ["#00008b"],
                },
                plotOptions: {
                    bar: {
                        horizontal: false, // 
                        columnWidth: '100%', // bar width
                        borderRadius: 5, // Rounded 
                        borderRadiusApplication: 'end',
                    },
                },
                xaxis: {
                    type: "datetime",
                    title: { text: "Date" },
                    style: { fontSize: "12px", color: "#333" },
                },
                yaxis: [
                    {
                        title: { text: "Price (USD)" },
                        labels: {
                            formatter: (value) => `$${value.toFixed(2)}`,
                            style: { fontSize: "10px", color: "#333" },
                        },
                    },
                    {
                        opposite: true,
                        title: { text: "Volume" },
                        labels: {
                            formatter: (value) =>
                                value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value.toFixed(0),
                        },
                    },
                ],
                tooltip: {
                    shared: true,
                    x: { format: "dd MMM yyyy" },
                },
                colors: ["#1f77b4", "#aec7e8"], // Custom colors
            },
        };
    },
    components: {
        apexchart: VueApexCharts,
    },
    props: {
        selectedToken: {
            type: String,
            required: true,
        },
    },
    computed: {
        dynamicChartOptions() {
            return {
                ...this.last30DaysChartOptions,
                chart: {
                    ...this.last30DaysChartOptions.chart,
                    type:
                        this.selectedChartType === "candlestick"
                            ? "candlestick"
                            : "line", // Adjust chart type dynamically
                },
                yaxis: {
                    title: {
                        text:
                            this.selectedChartType === "volume"
                                ? "Volume"
                                : this.selectedChartType === "candlestick"
                                    ? "Price (Candlestick)"
                                    : "Price (USD)",
                    },
                },
            };
        },
    },
    watch: {
        selectedToken: "fetchPriceData",
        // selectedChartType: "fetchPriceData",

        selectedChartType(newType) {
            if (newType === "candlestick") {
                // Update chart type to candlestick
                this.last30DaysChartOptions.chart.type = "candlestick";

                // Update Y-axis for candlestick
                this.last30DaysChartOptions.yaxis = [
                    {
                        title: { text: "Price (USD)" }, // Only one Y-axis for candlestick
                    },
                ];
            } else {
                // Update chart type to line for other chart types
                this.last30DaysChartOptions.chart.type = "line";

                // Update Y-axis for line chart
                this.last30DaysChartOptions.yaxis = [
                    {
                        title: { text: "Price (USD)" },
                        labels: {
                            formatter: (value) => `$${value.toFixed(2)}`,
                        },
                    },
                    {
                        opposite: true,
                        title: { text: "Volume" },
                        labels: {
                            formatter: (value) =>
                                value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value.toFixed(0),
                        },
                    },
                ];
            }
        },
    },

    methods: {
        /**
         * Fetch data for the selected tokens for 30day chart
         */

        // 1. get all available tokens
        async fetchTokens() {
            try {
                const response = await api.get('/functional/historical/tokens');
                this.tokens = response.data.data; // Adjust based on the structure
            } catch (err) {
                console.error('Error fetching tokens:', err);
            }
        },

        // get the data
        async fetchPriceData() {
            if (!this.selectedToken || !this.selectedTimeWindow) return;

            try {
                const response = await api.get(
                    `/functional/historical/${this.selectedToken}/${this.selectedTimeWindow}`,
                    {
                        params: { fields: "date_time,price_usd,volume_to" },
                    }
                );
                if (!response.data || !Array.isArray(response.data.data)) {
                    throw new Error(`Invalid API response for ${this.selectedTimeWindow}.`);
                }

                this.updatePriceChart(response.data.data);
            } catch (err) {
                console.error(`Error fetching ${this.selectedTimeWindow} data:`, err);
            }
        },

        /**
         * Update the chart series for price data
         */
        updatePriceChart(data) {
            const priceData = data.map((item) => ({
                x: new Date(item.date_time).getTime(),
                y: item.price_usd || 0, // Ensure fallback to 0 if price is missing
            }));

            const volumeData = data.map((item) => ({
                x: new Date(item.date_time).getTime(),
                y: item.volume_to || 0, // Ensure fallback to 0 if volume is missing
            }));

            this.last30DaysChartSeries = [
                {
                    name: "Price (USD)",
                    type: "line",
                    data: priceData,
                },
                {
                    name: "Volume",
                    type: "bar",
                    data: volumeData,
                },
            ];
        },

        /**
         * Update the chart series for candlestick data
        
        updateCandlestickChart(data) {
          // Filter out invalid data
          const transformedData = data
            .filter((d) => d.open !== null && d.high !== null && d.low !== null && d.price_usd !== null)
            .map((d) => ({
              x: new Date(d.date_time).getTime(), // Convert date_time to timestamp
              y: [d.open, d.high, d.low, d.price_usd], // ApexCharts expects [open, high, low, close]
            }));
    
          // Update the series
          this.last30DaysChartSeries = [
            {
              name: "Candlestick",
              data: transformedData,
            },
          ];
    
          console.log("Transformed Candlestick Data:", this.last30DaysChartSeries);
        },  */

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
            this.fetchTokens();
            this.fetchPriceData();
        }
    },

    mounted() {
        // Register EventBus listeners
        EventBus.on("dataUpdated", this.fetchPriceData);
        this.fetchTokens();
        this.fetchPriceData();
    },

    beforeUnmount() {
        // Unregister EventBus listeners
        EventBus.off("updateCurrentPrices", this.updateCurrentPrices);
        EventBus.off("refreshPortfolio", this.fetchPortfolioData);
        EventBus.off("dataUpdated", this.fetchPortfolioChartData);

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

.chart-controls {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

#crypto-select-30days {
    width: 100%;
    max-width: 300px;
    padding: 5px;
    border: 1px solid #cccccc;
    border-radius: 4px;
}

.chart-type-controls {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
}

.chart-render {
    width: 100%;
    overflow: hidden;
}

/* Responsive Design */
@media (max-width: 768px) {

    .chart-controls,
    .chart-type-controls {
        flex-direction: column;
    }

    .chart-render {
        height: auto;
    }
}
</style>
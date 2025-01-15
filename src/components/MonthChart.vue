<template>
    <div class="portfolio-container">
        <div class="graph-container">
            <div class="graphs-box">
                <h2>Last 30 Days</h2>

                <!-- Dropdown for Selecting Tokens -->
                <div class="chart-controls">
                    <label for="crypto-select-30days">Select a Token:</label>
                    <select id="crypto-select-30days" :value="selectedToken"
                        @input="$emit('update:selectedToken', $event.target.value)" @change="fetchChartData">
                        <option v-for="token in tokens" :key="token" :value="token">
                            {{ token }}
                        </option>
                    </select>

                    <!-- Time Window Controls -->
                    <!-- Checkboxes for Time Windows -->
                    <div class="time-window-controls"
                        style="display: inline-flex; align-items: center; margin-left: 40px;">
                        <label style="margin-right: 10px;">
                            <input type="radio" value="24h" v-model="selectedTimeWindow" @change="fetchChartData" />
                            24h
                        </label>
                        <label style="margin-right: 10px;">
                            <input type="radio" value="week" v-model="selectedTimeWindow" @change="fetchChartData" />
                            Week
                        </label>
                        <label>
                            <input type="radio" value="month" v-model="selectedTimeWindow" @change="fetchChartData" />
                            Month
                        </label>
                    </div>
                </div>


                <!-- Chart Rendering -->
                <div class="chart-render" v-if="chartSeries && chartSeries.length && chartOptions">
                    <apexchart :type="chartOptions.chart.type" :options="chartOptions" :series="chartSeries"
                        :formatDateTime="formatDateTime" />
                </div>

                <!-- Chart Type Controls -->
                <div class="chart-type-controls">
                    <label>
                        <input type="radio" value="price" v-model="selectedChartType" @change="fetchChartData" />
                        Price / Volume
                    </label>
                    <label>
                        <input type="radio" value="candlestick" v-model="selectedChartType" @change="fetchChartData" />
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
            chartSeries: [],
            chartOptions: {
                chart: {
                    height: 400,
                    type: "line",
                    stacked: false,
                    animations: { enabled: false },
                },
                xaxis: {
                    type: "datetime",
                    title: { text: "Date" },
                },
                yaxis: [
                    {
                        title: { text: "Price (USD)" },
                    },
                    {
                        opposite: true,
                        title: { text: "Volume" },
                    },
                ],
                tooltip: {
                    shared: true,
                    x: { format: "dd MMM yyyy" },
                },
                colors: ["#1f77b4", "#aec7e8"],
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
        formatDateTime: {
            type: Function,
            required: true,
        },
    },
    computed: {
        dynamicChartOptions() {
            return {
                ...this.chartOptions,
                chart: {
                    ...this.chartOptions.chart,
                    type:
                        this.selectedChartType === "candlestick"
                            ? "candlestick"
                            : "line",
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
        selectedToken: {
            immediate: true,
            handler(newToken) {
                if (newToken) {
                    // console.log(`Token changed to: ${newToken}`);
                    this.fetchChartData();
                }
            },
        },
        selectedChartType: {
            immediate: true,
            handler(newType) {
                if (newType === "candlestick") {
                    // console.log("Switching to Candlestick Chart");
                    this.fetchCSData();
                } else if (newType === "price") {
                    // console.log("Switching to Price Chart");
                    this.fetchPriceData();
                }
            },
        },
    },

    methods: {
        async fetchTokens() {
            try {
                const response = await api.get('/functional/historical/tokens');
                this.tokens = response.data.data;
            } catch (err) {
                console.error('Error fetching tokens:', err);
            }
        },

        resetChartState() {
            this.chartSeries = [];
            this.chartOptions = {
                ...this.chartOptions,
                series: [],
                chart: {
                    ...this.chartOptions.chart,
                    animations: { enabled: false },
                },
            };
        },


        fetchChartData() {
            if (this.selectedChartType === "candlestick") {
                this.fetchCSData();
            } else {
                this.fetchPriceData();
            }
        },

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

        async fetchCSData() {
            if (!this.selectedToken || !this.selectedTimeWindow) {
                console.warn("Token or Time Window not selected for candlestick data.");
                return;
            }

            const intervalMapping = {
                "24h": "15",
                "week": "4h",
                "month": "day"
            };

            const interval = intervalMapping[this.selectedTimeWindow];
            if (!interval) {
                console.error(`Invalid time window: ${this.selectedTimeWindow}`);
                return;
            }

            try {
                // console.log(`Fetching candlestick data for: ${this.selectedToken}, Interval: ${interval}`);

                const response = await api.get(
                    `/functional/historical/${this.selectedToken}/cs`,
                    {
                        params: {
                            time: interval,
                            start_date: this.getStartDate(this.selectedTimeWindow),
                            end_date: new Date().toISOString()
                        }
                    }
                );

                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error("Invalid response from candlestick API.");
                }

                this.updateCandlestickChart(response.data);
            } catch (err) {
                console.error(`Error fetching candlestick data: ${err.message}`);
            }
        },

        updatePriceChart(data) {
            const priceData = data.map((item) => ({
                x: new Date(item.date_time).getTime(),
                y: item.price_usd || 0,
            }));

            const volumeData = data.map((item) => ({
                x: new Date(item.date_time).getTime(),
                y: item.volume_to || 0,
            }));

            try {
                this.chartSeries = [
                    {
                        name: "Price (USD)",
                        type: "line",
                        data: priceData,
                    },
                    {
                        name: "Volume",
                        type: "line",
                        data: volumeData,
                    },
                ];

                this.chartOptions = {
                    ...this.chartOptions,
                    chart: {
                        ...this.chartOptions.chart,
                        type: "line",
                        height: 400,
                        width: "100%",
                        animations: { enabled: false },
                    },
                    colors: ["#001440", "#05C3DD"], // Blue for Price, Orange for Volume
                    stroke: {
                        curve: "smooth",
                        width: 2,
                    },                    
                    tooltip: {
                        shared: true,
                        x: {
                            formatter: (value) => this.formatDateTime(value), // Use the prop for formatting
                        },
                        y: {
                            formatter: (value, { seriesIndex }) => {
                                if (seriesIndex === 1) {
                                    // Format Volume
                                    return `${this.formatVolume(value)} Vol`;
                                }
                                // Format Price
                                return `$${this.formatNumberMonthly(value)}`;
                            },
                        },
                    },
                    yaxis: [
                        {
                            title: { text: "Price (USD)" },
                            labels: {
                                formatter: (value) => this.formatNumberMonthly(value),
                            },
                            min: Math.max(
                                Math.min(...priceData.map((p) => p.y)) * 0.9,
                                0
                            ),
                            max: Math.max(...priceData.map((p) => p.y)) * 1.1,
                            forceNiceScale: true, // Ensure consistent scaling
                        },
                        {
                            opposite: true,
                            title: { text: "Volume" },
                            labels: {
                                formatter: (value) => this.formatVolume(value),
                            },
                        },
                    ],
                };

                // Ensure the chart is properly re-rendered
                this.$nextTick(() => {
                    if (this.$refs.apexChart) {
                        this.$refs.apexChart.reflow();
                    }
                });
            } catch (err) {
                console.error("Error updating chart:", err.message);
            }
        },

        formatVolume(value) {
            if (value >= 1e9) {
                return `${(value / 1e9).toFixed(2)}B`;
            } else if (value >= 1e6) {
                return `${(value / 1e6).toFixed(2)}M`;
            } else if (value >= 1e3) {
                return `${(value / 1e3).toFixed(1)}K`;
            }
            return value.toLocaleString();
        },

        updateCandlestickChart(data) {
            const transformedData = data
                .filter((d) => d.open && d.high && d.low && d.close) // Filter invalid data
                .map((d) => ({
                    x: new Date(d.period).getTime(),
                    y: [d.open, d.high, d.low, d.close],
                }));
            try {
                if (!transformedData.length) {
                    throw new Error("No valid data for candlestick chart.");
                }
                this.chartSeries = [
                    {
                        name: "Candlestick",
                        type: "candlestick",
                        data: transformedData,
                    },
                ];
                this.chartOptions = {
                    ...this.chartOptions,
                    chart: {
                        ...this.chartOptions.chart,
                        type: "candlestick",
                        height: 400,
                        animations: { enabled: false },
                    },
                    tooltip: {
                        shared: true,
                        x: {
                            formatter: (value) => this.formatDateTime(value),
                        },
                        y: {
                            formatter: (value) => this.formatNumberMonthly(value),
                        },
                    },
                    yaxis: [
                        {
                            title: { text: "Price (USD)" },
                            labels: {
                                formatter: (value) => this.formatNumberMonthly(value),
                            },
                        },
                    ],
                };

                // Trigger a reflow
                this.$nextTick(() => {
                    if (this.$refs.apexChart) {
                        this.$refs.apexChart.updateSeries(this.chartSeries);
                        this.$refs.apexChart.reflow();
                    }
                });
            } catch (err) {
                console.error("Error updating candlestick chart:", err.message);
            }
        },

        formatNumberMonthly(value) {
            if (!value || isNaN(value)) return "0.00";

            if (value >= 1) {
                return value.toFixed(2);
            } else if (value > 0 && value < 1) {
                if (value < 0.0001) {
                    return parseFloat(value.toFixed(7)).toString();
                }
                return parseFloat(value.toFixed(3)).toString();
            }
            return value.toString();
        },


        getStartDate(timeWindow) {
            const now = new Date();
            switch (timeWindow) {
                case "24h":
                    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                case "week":
                    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                case "month":
                    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                default:
                    return now.toISOString();
            }
        },
    },
    // methods block end

    created() {
        const token = localStorage.getItem("token");
        if (!token) {
            this.$router.push("/login");
        } else {
            this.fetchTokens();
            this.fetchChartData();
        }
    },

    mounted() {
        EventBus.on("dataUpdated", this.fetchChartData);
        this.$nextTick(() => {
            if (this.$refs.apexChart) {
                this.$refs.apexChart.reflow();
            }
        });
    },

    beforeUnmount() {
        EventBus.off("dataUpdated", this.fetchChartData);
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
    max-width: 100%;
    height: 400px;
    max-height: 400px;
    overflow: hidden;
}

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

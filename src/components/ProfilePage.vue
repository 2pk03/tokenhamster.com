<template>
  <div class="page-container">
    <div class="default-box">
      <div class="profile-section">
        <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Profile Picture" class="profile-picture" />
        <p v-else>Loading image...</p>
      </div>
      <div class="action-card">
        <p><strong>Username:</strong> {{ profile.username }}</p>
        <p><strong>Email:</strong> {{ profile.email }}</p>
        <p><strong>User ID:</strong> {{ profile.id }}</p>
      </div>
    </div>

    <div class="default-box">
      <div class="action-card">
        <h3>Portfolio Backup and Restore</h3>
        <button @click="downloadPortfolio">Download</button>
        <input type="file" ref="fileInput" @change="handleFileSelect" accept=".csv" hidden />
        <button @click="triggerFileUpload" class="button-imp">Upload</button>
      </div>

      <div v-if="fileSelected" class="upload-box">
        <h4>Selected File</h4>
        <p>{{ fileName }}</p>
        <button @click="confirmUpload" class="button-imp">Import</button>
        <button @click="cancelUpload" class="button-imp">Cancel</button>
        <p class="warning-message">
          Are you sure? This will overwrite your existing portfolio, if any.
        </p>
      </div>
    </div>

    <div class="default-box">
      <h3>Audit Log</h3>
      <div class="audit-log">
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Timestamp</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in auditLogs" :key="log.timestamp">
              <td>{{ log.action }}</td>
              <td>{{ log.timestamp ? formatDate(log.timestamp) : 'N/A' }}</td>
              <td>
                <div v-if="getFormattedDetails(log)">
                  <strong>{{ getFormattedDetails(log).description }}</strong>
                  <ul v-if="getFormattedDetails(log).list.length">
                    <li v-for="(item, index) in getFormattedDetails(log).list" :key="index">{{ item }}</li>
                  </ul>
                </div>
                <p v-else>No details available.</p>
              </td>
            </tr>
          </tbody>

        </table>
        <div class="pagination">
          <button @click="prevPage" :disabled="currentPage === 1">&lt; Previous</button>
          <span>Page {{ currentPage }}</span>
          <button @click="nextPage">Next &gt; </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from "@/api";

export default {
  data() {
    return {
      profile: {
        id: "",
        username: "",
        email: "",
      },
      profilePictureUrl: "",
      auditLogs: [],
      currentPage: 1,
      rowsPerPage: 10,
      file: null,
      fileSelected: false,
      fileName: "",
    };
  },
  mounted() {
    this.fetchProfile();
    this.fetchAuditLogs();
    document.addEventListener('keydown', this.handleEscKey);
  },

  methods: {
    async fetchProfile() {
      try {
        const response = await api.get("/user/profile/");
        this.profile = response.data;

        // Fetch the profile picture
        this.fetchProfilePicture(response.data.profilePicture);
      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    },
    async fetchProfilePicture(url) {
      try {
        const response = await api.get(url, { responseType: "blob" });
        this.profilePictureUrl = URL.createObjectURL(response.data);
      } catch (error) {
        console.error("Error fetching profile picture:", error);
      }
    },

    // portfolio actions
    async downloadPortfolio() {
      try {
        const response = await api.get("/user/portfolio/export", { responseType: "blob" });
        const url = URL.createObjectURL(response.data);
        const link = document.createElement("a");
        link.href = url;
        link.download = "portfolio.csv";
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error downloading portfolio:", error.message || error);
        alert("Failed to download portfolio. Please try again.");
      }
    },
    triggerFileUpload() {
      this.$refs.fileInput.click();
    },
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        const fileType = file.type;
        if (fileType !== "text/csv" && !file.name.endsWith(".csv")) {
          alert("Only CSV files are allowed.");
          this.resetFileUpload();
          return;
        }
        this.file = file;
        this.fileSelected = true;
        this.fileName = file.name;
      }
    },
    async confirmUpload() {
      if (!this.file) return;

      const formData = new FormData();
      formData.append("file", this.file);

      try {
        const response = await api.post("/user/portfolio/import", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        alert(response.data.message || "Portfolio imported successfully.");
      } catch (error) {
        console.error("Error importing portfolio:", error.message || error);
        alert("Failed to import portfolio. Please try again.");
      } finally {
        this.resetFileUpload();
      }
    },
    cancelUpload() {
      this.resetFileUpload();
    },
    resetFileUpload() {
      this.file = null;
      this.fileSelected = false;
      this.fileName = ""; // Reset file name
      this.$refs.fileInput.value = null;
    },

    async fetchAuditLogs() {
      try {
        const response = await api.get('/user/portfolio/audit/logs', {
          params: { page: this.currentPage, limit: this.rowsPerPage },
        });
        this.auditLogs = response.data;
      } catch (error) {
        console.error('Error fetching audit logs:', error.message);
      }
    },

    // make date/time more readable
    getFormattedDetails(log) {
      try {
        return this.formatAuditDetails(log.action, log.details);
      } catch (error) {
        console.error("Error formatting audit details:", error, log);
        return { description: "Invalid details", list: [] };
      }
    },
    // format audit details
    formatAuditDetails(action, details) {
      // Handle missing or invalid details
      if (!details) return { description: 'N/A', list: [] };

      console.log('Formatting audit details:', { action, details }); // DEBUG

      let parsedDetails;
      try {
        // Parse details if it's a JSON string
        parsedDetails = typeof details === 'string' ? JSON.parse(details) : details || {};
      } catch (error) {
        console.warn('Failed to parse audit details:', details);
        return {
          description: `Action: ${action}`,
          list: ['Invalid details format. Please contact support.'],
        };
      }

      // Format datetime fields in the details (e.g., "Time")
      const formattedDetails = {};
      for (const [key, value] of Object.entries(parsedDetails)) {
        if (key.toLowerCase() === 'time' && typeof value === 'string') {
          try {
            // Normalize datetime string if it lacks 'Z' for UTC
            const normalizedValue = value.endsWith('Z') ? value : `${value}Z`;
            formattedDetails[key] = this.formatDate(normalizedValue);
          } catch (error) {
            console.warn(`Failed to format datetime for key: ${key}`, error);
            formattedDetails[key] = 'Invalid date';
          }
        } else {
          formattedDetails[key] = value;
        }
      }

      // Generate descriptions and lists based on the action
      switch (action) {
        case 'IMPORT_PORTFOLIO':
          return {
            description: `Imported ${formattedDetails.count || 0} entries:`,
            list: formattedDetails.tokens || [],
          };
        case 'ADD_TOKEN':
          return {
            description: `Token Added:`,
            list: [
              `Symbol: ${formattedDetails.symbol || 'N/A'}`,
              `Price: ${formattedDetails.purchasePrice || 'N/A'} ${formattedDetails.purchaseCurrency || 'N/A'}`,
              `Date: ${formattedDetails.purchaseDate || 'N/A'}`,
              `Amount: ${formattedDetails.amount || 'N/A'}`,
            ],
          };
        case 'OTP_VALIDATION_SUCCESS':
        case 'OTP_VALIDATION_FAILED':
          return {
            description: `OTP Validation Event`,
            list: [
              `Status: ${action === 'OTP_VALIDATION_SUCCESS' ? 'Success' : 'Failed'}`,
              `Retries: ${formattedDetails.retries || 0}`,
              `Time: ${formattedDetails.time || 'Unknown'}`,
            ],
          };
        default:
          return {
            description: `Action: ${action}`,
            list: ['No additional details available.'],
          };
      }
    },

    formatDate(timestamp) {
      if (!timestamp) return 'N/A';
      try {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const utcDate = new Date(timestamp);

        if (isNaN(utcDate)) {
          throw new Error(`Invalid date: ${timestamp}`);
        }

        return new Intl.DateTimeFormat('de-DE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: userTimeZone,
          hour12: false,
        }).format(utcDate);
      } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid date';
      }
    },
  },
};
</script>
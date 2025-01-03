<template>
  <div class="profile-page">
    <div class="profile-section">
      <img v-if="profilePictureUrl" :src="profilePictureUrl" alt="Profile Picture" class="profile-picture" />
      <p v-else>Loading image...</p>
    </div>
    <div class="profile-details">
      <p><strong>Username:</strong> {{ profile.username }}</p>
      <p><strong>Email:</strong> {{ profile.email }}</p>
      <p><strong>User ID:</strong> {{ profile.id }}</p>
    </div>
  </div>

  <div class="profile-page">
    <div class="action-card">
      <h3>Portfolio Actions</h3>
      <button @click="downloadPortfolio" class="action-button">Download Portfolio</button>
      <input type="file" ref="fileInput" @change="handleFileSelect" accept=".csv" hidden />
      <button @click="triggerFileUpload" class="action-button">Upload Portfolio</button>
    </div>

    <div v-if="fileSelected" class="upload-box">
      <h4>Selected File</h4>
      <p>{{ fileName }}</p>
      <button @click="confirmUpload" class="confirm-button">Import</button>
      <button @click="cancelUpload" class="cancel-button">Cancel</button>
      <p class="warning-message">
        Are you sure? This will overwrite your existing portfolio, if any.
      </p>
    </div>
  </div>

  <div class="profile-page">
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
              <div v-if="formatAuditDetails(log.action, log.details)">
                <strong>{{ formatAuditDetails(log.action, log.details).description }}</strong>
                <ul v-if="formatAuditDetails(log.action, log.details).list.length">
                  <li v-for="(item, index) in formatAuditDetails(log.action, log.details).list" :key="index">{{ item }}
                  </li>
                </ul>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pagination">
        <button @click="prevPage" :disabled="currentPage === 1">&lt; Previous</button>
        <span>Page {{ currentPage }}</span>
        <button @click="nextPage">&gt; Next</button>
      </div>
    </div>
  </div>

  <div class="profile-page">
    <div class="delete-account-section">
      <h3>Deactivate Your Account</h3>
      <p class="delete-warning">
        Deactivating your account will mark all associated data as inactive. In compliance with GDPR and AML
        regulations, your data will be securely retained for a period of 90 days. During this time, your account can be
        reactivated if you choose to return. If no reactivation occurs within this period, all data will be permanently
        deleted. This action is final and cannot be undone after 90 days.
      </p><br>

      <!-- Initial Delete Button -->
      <button class="delete-button" v-if="!showFirstConfirmation && !showFinalConfirmation"
        @click="showFirstConfirmation = true">
        Deactivate My Account
      </button>

      <!-- First Confirmation -->
      <div v-if="showFirstConfirmation && !showFinalConfirmation">
        <p class="confirmation-warning">
          <br>Are you sure you want to deactivate your account?
        </p>
        <button class="confirm-button" @click="showFinalConfirmation = true">
          Yes, Proceed
        </button>
        <button class="cancel-button" @click="cancelDeletion">Cancel</button>
      </div>

      <!-- Final Confirmation -->
      <div v-if="showFinalConfirmation">
        <p class="final-warning">
          This is your final confirmation. Do you really want to delete your account?
        </p>
        <button class="confirm-button" @click="() => { console.log('Button Clicked'); finalizeDelete(); }">
          Yes, Delete My Account
        </button>
        <button class="cancel-button" @click="cancelDeletion">Cancel</button>
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
      showSecondDeleteModal: false,
      showFirstConfirmation: false,
      showFinalConfirmation: false,
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
    formatDate(timestamp) {
      if (!timestamp) return 'N/A';
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Treat timestamp as UTC explicitly
      const utcDate = new Date(timestamp + 'Z');

      return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimeZone,
        hour12: false,
      }).format(utcDate);
    },
    async downloadAuditLog() {
      try {
        const response = await api.get('/user/portfolio/audit/logs', {
          params: { limit: 1000 }, // Fetch a larger dataset for download
          responseType: 'blob',
        });

        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'audit_log.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Log the download action
        await api.post('/user/portfolio/audit/log', { action: 'DOWNLOAD_AUDIT_LOG' });
      } catch (error) {
        console.error('Error downloading audit log:', error.message);
      }
    },
    nextPage() {
      this.currentPage += 1;
      this.fetchAuditLogs();
    },
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage -= 1;
        this.fetchAuditLogs();
      }
    },

    // delete accout
    cancelDeletion() {
      this.showFirstConfirmation = false;
      this.showFinalConfirmation = false;
    },
    async finalizeDelete() {
      try {
        const response = await api.delete("/user/profile/delete");
        if (response.status === 200) {
          alert("Account deleted successfully. You will be logged out.");
          localStorage.removeItem("token");
          this.$router.push("/login");
        } else {
          throw new Error("Failed to delete account. Please try again.");
        }
      } catch (error) {
        console.error("Error deleting account:", error.message);
        alert("An error occurred while deleting your account. Please try again.");
      }
    },

    // format audit details
    formatAuditDetails(action, details) {
      if (!details) return 'N/A';

      let parsedDetails;
      try {
        parsedDetails = JSON.parse(details);
      } catch (error) {
        console.warn('Failed to parse audit details:', details);
        return 'Invalid data';
      }

      switch (action) {
        case 'IMPORT_PORTFOLIO':
          return {
            description: `Imported ${parsedDetails.count} entries:`,
            list: parsedDetails.tokens || [],
          };
        case 'ADD_TOKEN':
          return {
            description: `Token Added:`,
            list: [
              `Symbol: ${parsedDetails.symbol}`,
              `Price: ${parsedDetails.purchasePrice} ${parsedDetails.purchaseCurrency}`,
              `Date: ${parsedDetails.purchaseDate}`,
              `Amount: ${parsedDetails.amount}`,
            ],
          };
        case 'DELETE_TOKEN':
          return {
            description: `Token Deleted: ${parsedDetails.symbol}`,
            list: [],
          };
        case 'EXPORT_PORTFOLIO':
          return {
            description: `Exported ${parsedDetails.count} entries.`,
            list: [],
          };
        case 'MARK_DELETE_PORTFOLIO':
          return {
            description: `Portfolio Marked for Deletion: ${parsedDetails.name || 'N/A'}`,
            list: [],
          };
        case 'ADD_PORTFOLIO':
          return {
            description: `Portfolio Created`,
            list: [],
          };
        default:
          return {
            description: 'N/A',
            list: [],
          };
      }
    },
  },
};
</script>
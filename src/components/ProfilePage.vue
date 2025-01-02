<template>
    <div class="profile-page">
      <div class="profile-section">
        <img
          v-if="profilePictureUrl"
          :src="profilePictureUrl"
          alt="Profile Picture"
          class="profile-picture"
        />
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
        file: null,
        fileSelected: false,
        fileName: "", // Added to display the file name
      };
    },
    mounted() {
      this.fetchProfile();
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
          const response = await api.get("/portfolio/fetch", { responseType: "blob" });
          const url = URL.createObjectURL(response.data);
          const link = document.createElement("a");
          link.href = url;
          link.download = "portfolio.csv";
          link.click();
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Error downloading portfolio:", error);
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
          this.fileName = file.name; // Display the selected file name
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
          console.error("Error importing portfolio:", error);
          alert("Failed to import portfolio.");
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
    },
  };
  </script>
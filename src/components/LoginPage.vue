<template>
  <div class="login-container">
    <img src="/images/tokenhamster.webp" alt="Hamster Background" class="background-image" />    
    <div class="login-page">
      <div class="center-content">
        <h1 class="main-title">The TokenHamster</h1>
        <p class="subtitle">Track your crypto offline securely and easily</p>
        <strong>beta v. 0.72</strong>
      </div>

      <!-- Google Login Button -->
      <button v-if="!showOtpField" @click="initiateGoogleLogin" class="google-login-button">
        Login with Google
      </button>

      <!-- OTP and Recovery Section -->
      <div v-if="showOtpField" class="otp-container">
        <p v-if="!useRecoveryPhrase">Please enter the OTP from your authenticator app:</p>
        <p v-if="useRecoveryPhrase">Enter your recovery phrase to disable 2FA:</p>

        <input v-model="currentInput" type="text"
          :placeholder="useRecoveryPhrase ? 'Enter Recovery Phrase' : 'Enter OTP'" class="otp-input"
          @keyup.enter="submitOtpOrRecovery()" />

        <button class="button-large-imp" @click="submitOtpOrRecovery()">
          {{ useRecoveryPhrase ? 'Recover 2FA' : 'Submit OTP' }}
        </button>

        <button class="button-large toggle-recovery" @click="toggleRecoveryMode">
          {{ useRecoveryPhrase ? 'Use OTP Instead' : 'Recover Using Recovery Phrase' }}
        </button>

        <p v-if="otpErrorMessage" class="otp-error-message">{{ otpErrorMessage }}</p>
        <p v-if="recoverySuccess" class="success-message">
          Two-Factor Authentication is now disabled. You can re-enable it in your account settings.
        </p>

      </div>
    </div>
  </div>
</template>
<script>
import api from "@/api";
import { jwtDecode } from 'jwt-decode';
import EventBus from "@/eventBus";

export default {
  name: "LoginPage",
  data() {
    return {
      username: "",
      password: "",
      error: "",
      googleClientId: process.env.VUE_APP_GOOGLE_CLIENT_ID,
      idToken: "",
      otp: "",
      showOtpField: false,
      errorMessage: "",
      otpErrorMessage: "",
      maxRetries: 3,
      retryCount: 0,
      useRecoveryPhrase: false,
      recoverySuccess: false,
      recoveryPhrase: "",
    };
  },
  computed: {
    currentInput: {
      get() {
        return this.useRecoveryPhrase ? this.recoveryPhrase : this.otp;
      },
      set(value) {
        if (this.useRecoveryPhrase) {
          this.recoveryPhrase = value;
        } else {
          this.otp = value;
        }
      },
    },
  },
  methods: {
    /*   deprecated login method, we use OAuth2.0 now
         async login() {
         try {
           // Clear any previous token
           localStorage.removeItem('token');
           console.log("Attempting login with username:", this.username);
           console.log('Store state after login:', this.$store.state.auth);
   
           // Send login request
           const response = await api.post('/user/auth/login', {
             username: this.username,
             password: this.password,
           });
   
           const token = response.data.token;
   
           // Save token in localStorage
           localStorage.setItem('token', token);
           console.log("Token saved to localStorage");
   
           // Clear any previous error messages
           this.error = null;
   
           // Manually trigger isAuthenticated update (if needed)
           this.$store.commit('auth/setAuthenticated', true);
   
           // Redirect to portfolio page
           console.log("Redirecting to /portfolio");
           this.$router.push('/portfolio').catch((err) => {
             if (err.name !== 'NavigationDuplicated') {
               console.error("Navigation error:", err);
             }
           });
         } catch (err) {
           // Handle different error scenarios
           console.error("Login failed:", err.response ? err.response.data : err);
   
           if (err.response && err.response.status === 401) {
             this.error = 'Invalid username or password';
           } else if (err.response && err.response.status === 500) {
             this.error = 'Server error. Please try again later.';
           } else {
             this.error = 'An unexpected error occurred. Please try again.';
           }
         }
       }, */

    // Google Login
    initiateGoogleLogin() {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        console.error("Google Identity Services SDK is not ready.");
        this.error = "Google Login is not available at the moment. Please try again later.";
        return;
      }

      const clientId = this.googleClientId;

      try {
        // Ensure Google SDK is initialized properly
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => this.handleGoogleLogin(response.credential),
        });

        // Trigger the login UI
        window.google.accounts.id.prompt();
      } catch (error) {
        console.error("Error initializing Google Login:", error);
        this.error = "An error occurred during Google Login initialization.";
      }
    },

    async handleGoogleLogin(idToken) {
      try {

        // Send the Google ID token to the backend for validation
        const response = await api.post("/user/auth/google/validate", { idToken });
        const token = response.data.token;

        // Save token in localStorage
        localStorage.setItem("token", token);

        // Set authentication state in Vuex
        this.$store.commit("auth/setToken", token);
        this.$store.commit("auth/setUser", jwtDecode(token));
        EventBus.emit("userLoggedIn");

        // Log successful login to Audit API
        await api.post("/user/security/audit", {
          action: "LOGIN_SUCCESS",
          details: {
            method: "Google OAuth",
            time: new Date().toISOString(),
          },
        }).catch((auditErr) => {
          console.error("Failed to log successful login to audit log:", auditErr.response?.data || auditErr);
        });

        // Redirect to the portfolio page
        this.$router.push("/portfolio").catch((err) => {
          if (err.name !== "NavigationDuplicated") {
            console.error("Navigation error:", err);
          }
        });
      } catch (err) {
        console.error("Error validating Google login:", err.response ? err.response.data : err);

        // Log failed login attempt to Audit API
        await api.post("/user/security/audit", {
          action: "LOGIN_FAILED",
          details: {
            reason: err.response?.data?.error || "Unknown error",
            time: new Date().toISOString(),
          },
        }).catch((auditErr) => {
          console.error("Failed to log failed login to audit log:", auditErr.response?.data || auditErr);
        });

        // Handle specific 2FA flow
        if (err.response?.data?.error === "Two-Factor Authentication required") {
          this.showOtpField = true;
          this.idToken = idToken; // Store ID token for OTP submission
          this.errorMessage = "Two-Factor Authentication is required. Please enter your OTP.";
        } else {
          this.errorMessage = "Google login validation failed. Please try again.";
        }
      }
    },

    // otp and recovery
    async submitOtpOrRecovery() {
      if (this.retryCount >= this.maxRetries) {
        this.otpErrorMessage = "Too many incorrect attempts. Please try again later.";

        // Log attempt blocking via Audit API
        await api.post("/user/security/audit", {
          action: "OTP_ATTEMPT_BLOCKED",
          details: {
            reason: "Max retry limit reached",
            retries: this.retryCount,
            time: new Date().toISOString(),
          },
        }).catch((err) => {
          console.error("Failed to log audit action for blocked attempts:", err.response?.data || err);
        });

        return;
      }

      try {
        const response = await api.post("/user/auth/google/validate", {
          idToken: this.idToken,
          otp: !this.useRecoveryPhrase ? this.otp : null,
          recoveryPhrase: this.useRecoveryPhrase ? this.recoveryPhrase : null,
        });

        const token = response.data.token;

        // Save token in localStorage
        localStorage.setItem("token", token);

        // Set authentication state in Vuex
        this.$store.commit("auth/setToken", token);
        this.$store.commit("auth/setUser", jwtDecode(token));
        EventBus.emit("userLoggedIn");

        // Log successful validation
        const action = this.useRecoveryPhrase ? "2FA_RECOVERY" : "OTP_VALIDATION_SUCCESS";
        await api.post("/user/security/audit", {
          action: action,
          details: {
            retries: this.retryCount,
            time: new Date().toISOString(),
          },
        }).catch((err) => {
          console.error("Failed to log audit action for success:", err.response?.data || err);
        });

        // Show success message for recovery phrase
        if (this.useRecoveryPhrase) {
          alert("Two-Factor Authentication is now disabled. You can re-enable it in your account settings.");
          this.recoverySuccess = true;
        }

        // Reset retry count
        this.retryCount = 0;

        // Redirect to the portfolio page
        this.$router.push("/portfolio").catch((err) => {
          if (err.name !== "NavigationDuplicated") {
            console.error("Navigation error:", err);
          }
        });
      } catch (err) {
        console.error("Error validating OTP or Recovery Phrase:", err.response?.data || err);
        this.retryCount++;

        const remainingAttempts = this.maxRetries - this.retryCount;
        if (remainingAttempts > 0) {
          this.otpErrorMessage = this.useRecoveryPhrase
            ? `Invalid recovery phrase. Please try again.`
            : `Your submitted token is wrong, please try again. You have ${remainingAttempts} more attempt(s).`;
        } else {
          this.otpErrorMessage = "Too many incorrect attempts. Please try again later.";
        }

        // Log failed validation attempt
        const action = this.useRecoveryPhrase ? "2FA_RECOVERY_FAILED" : "OTP_VALIDATION_FAILED";
        await api.post("/user/security/audit", {
          action: action,
          details: {
            reason: this.useRecoveryPhrase ? "Invalid Recovery Phrase" : "Invalid OTP",
            retries: this.retryCount,
            time: new Date().toISOString(),
          },
        }).catch((err) => {
          console.error("Failed to log audit action for failure:", err.response?.data || err);
        });
      }
    },
    toggleRecoveryMode() {
      this.useRecoveryPhrase = !this.useRecoveryPhrase;
      this.otpErrorMessage = ""; // Clear error messages
    },
  },
};
</script>
<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100%;
  background-size: cover; 
  background-position: center; 
  background-repeat: no-repeat; 
}

.login-page {
  max-width: 500px;
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.background-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* Ensure the image covers the container */
  z-index: -1; /* Send the image to the background */
}
</style>
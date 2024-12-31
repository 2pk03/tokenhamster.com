<template>
    <div class="profile-page">
        <h1>User Profile</h1>

        <!-- Profile Picture Section -->
        <div class="profile-picture-section">
            <img :src="profilePicture" alt="Profile Picture" class="profile-picture" />
            <input type="file" @change="uploadProfilePicture" />
        </div>

        <!-- Update Personal Details -->
        <div class="profile-details">
            <h2>Personal Details</h2>
            <form @submit.prevent="updateDetails">
                <label for="name">Name:</label>
                <input type="text" id="name" v-model="name" required />

                <label for="email">Email:</label>
                <input type="email" id="email" v-model="email" required />

                <button type="submit">Update Details</button>
            </form>
        </div>

        <!-- Update Password -->
        <div class="password-section">
            <h2>Update Password</h2>
            <form @submit.prevent="updatePassword">
                <label for="currentPassword">Current Password:</label>
                <input type="password" id="currentPassword" v-model="currentPassword" required />

                <label for="newPassword">New Password:</label>
                <input type="password" id="newPassword" v-model="newPassword" required />

                <label for="confirmPassword">Confirm New Password:</label>
                <input type="password" id="confirmPassword" v-model="confirmPassword" required />

                <button type="submit">Update Password</button>
            </form>
        </div>

        <!-- Account Settings -->
        <div class="account-settings">
            <h2>Account Settings</h2>
            <button class="delete-account-button" @click="confirmDeleteAccount">Delete Account</button>
        </div>

        <!-- Message Modal -->
        <div v-if="showModal" class="modal-overlay">
            <div class="modal">
                <p>{{ modalMessage }}</p>
                <button @click="closeModal">OK</button>
            </div>
        </div>
    </div>
</template>

<script>
import api from "@/api";

export default {
    name: "ProfilePage",
    data() {
        return {
            profilePicture: '', // User's profile picture URL
            name: '', // User's name
            email: '', // User's email
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
            showModal: false, // Modal visibility state
            modalMessage: '', // Modal message content
        };
    },
    methods: {
        async loadProfile() {
            try {
                const response = await api.get('/user/profile'); // Ensure 'response' is defined here
                this.profilePicture = response.data.profilePicture || '/logo.webp'; 
                this.name = response.data.name;
                this.email = response.data.email;
            } catch (error) {
                console.error('Error loading profile:', error);
                this.profilePicture = '/logo.webp'; 
            }
        },
        async uploadProfilePicture(event) {
            const file = event.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('profilePicture', file);

            try {
                await api.post('/user/profile/picture', formData);
                this.showModal = true;
                this.modalMessage = 'Profile picture updated successfully.';
                this.loadProfile();
            } catch (error) {
                console.error('Error uploading profile picture:', error);
            }
        },
        async updateDetails() {
            try {
                await api.put('/user/profile', { name: this.name, email: this.email });
                this.showModal = true;
                this.modalMessage = 'Details updated successfully.';
            } catch (error) {
                console.error('Error updating details:', error);
            }
        },
        async updatePassword() {
            if (this.newPassword !== this.confirmPassword) {
                this.showModal = true;
                this.modalMessage = 'Passwords do not match.';
                return;
            }

            try {
                await api.put('/user/profile/password', {
                    currentPassword: this.currentPassword,
                    newPassword: this.newPassword,
                });
                this.showModal = true;
                this.modalMessage = 'Password updated successfully.';
                this.currentPassword = '';
                this.newPassword = '';
                this.confirmPassword = '';
            } catch (error) {
                console.error('Error updating password:', error);
            }
        },
        confirmDeleteAccount() {
            if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                this.deleteAccount();
            }
        },
        async deleteAccount() {
            try {
                await api.delete('/user/profile');
                this.showModal = true;
                this.modalMessage = 'Account deleted successfully.';
                setTimeout(() => {
                    this.$router.push('/login');
                }, 2000); // Redirect to login after 2 seconds
            } catch (error) {
                console.error('Error deleting account:', error);
            }
        },
        closeModal() {
            this.showModal = false;
            if (this.modalMessage === 'Account deleted successfully.') {
                this.$router.push('/login');
            }
        },
    },
    mounted() {
        this.loadProfile();
    },
};
</script>
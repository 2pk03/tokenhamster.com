# TokenHamster API Documentation

[TokenHamster](https://tokenhamster.com) is a private cryptocurrency tracking and portfolio management system. Below is a brief description of the API endpoints, focusing on their functionality. If you're interested in learning more, contact **me@tokenhamster.com**.

---

## API Endpoints

### Authentication
- **POST /api/user/auth/google/validate**  
  Validates Google OAuth tokens and manages user login or registration.

- **POST /api/user/auth/refresh-token**  
  Refreshes an expired JWT for continued access.

---

### Portfolio Management
- **GET /api/user/portfolio/fetch**  
  Retrieves the user's current cryptocurrency portfolio.

- **POST /api/user/portfolio/token/add**  
  Adds a cryptocurrency to the user's portfolio.

- **POST /api/user/portfolio/token/remove**  
  Removes a cryptocurrency from the user's portfolio.

- **POST /api/user/portfolio/import**  
  Imports portfolio data from a CSV file.

- **GET /api/user/portfolio/export**  
  Exports portfolio data to a CSV file.

- **GET /api/user/portfolio/token/history**  
  Provides transaction history for a specific cryptocurrency in the portfolio.

- **GET /api/user/portfolio/perf/data**  
  Fetches performance data for the portfolio, aggregated over time.

- **GET /api/user/portfolio/perf/daily**  
  Provides daily performance change (win/loss) for the portfolio.

---

### Cryptocurrency Data
- **GET /api/functional/price/current**  
  Retrieves the latest price of a cryptocurrency or the last updated time for all cryptocurrencies.

- **GET /api/functional/price/convert**  
  Converts an amount between two cryptocurrencies using the latest rates.

- **GET /api/functional/historical/:crypto_symbol**  
  Fetches historical price data for a specific cryptocurrency, with options for date range and fields.

- **GET /api/functional/historical/:crypto_symbol/:time_window**  
  Provides aggregated historical data (e.g., last 24 hours, 7 days, or 30 days).

- **GET /api/functional/historical/:crypto_symbol/cs**  
  Fetches candlestick data aggregated into intervals (e.g., 15 minutes, 1 hour, daily).

- **GET /api/functional/currency/supported**  
  Lists supported cryptocurrencies based on a search query.

---

### Polling
- **POST /api/functional/polling/start**  
  Starts polling for live cryptocurrency price updates.

- **POST /api/functional/polling/stop**  
  Stops polling for cryptocurrency price updates.

---

### User Profile
- **GET /api/user/profile**  
  Retrieves user profile details (e.g., email, username, profile picture).

- **PUT /api/user/profile/currency**  
  Updates the user's preferred currency (e.g., USD or EUR).

- **DELETE /api/user/profile/delete**  
  Deactivates the user's account and associated portfolios.

---

### Security
- **GET /api/user/security/2fa-status**  
  Checks if two-factor authentication (2FA) is enabled for the user.

- **POST /api/user/security/enable-2fa**  
  Initiates the setup process for 2FA and provides the recovery phrase.

- **POST /api/user/security/verify-2fa**  
  Verifies the OTP and activates 2FA.

- **POST /api/user/security/disable-2fa**  
  Disables 2FA for the user account.

- **POST /api/user/security/cancel-2fa-setup**  
  Cancels a 2FA setup in progress.

- **POST /api/user/security/recover-2fa**  
  Disables 2FA using the recovery phrase.

---

### Audit Logs
- **GET /api/user/profile/audit/logs**  
  Retrieves a paginated list of user actions (e.g., portfolio updates, logins).

- **GET /api/user/profile/audit/export**  
  Exports user audit logs as a CSV file.

- **POST /api/user/profile/audit**  
  Logs a custom user action for auditing purposes.

---

### Miscellaneous
- **GET /api/user/profile/image/:id**  
  Fetches the user's profile picture.

---

## Contact

For inquiries or collaboration opportunities, contact us at **me@tokenhamster.com**.

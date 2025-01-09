// src/services/relayService.js
import EventBus from "./eventBus";

let eventSource = null;

export function initializeRelay() {
  const baseUrl = process.env.VUE_APP_EVENT_BASE_URL || "https://www.tokenhamster.com";
  const sseUrl = `${baseUrl}/events`;
  console.log(`[Relay] Initializing EventSource with URL: ${sseUrl}`);

  function connect() {
    console.log("[Relay] Attempting to connect to SSE...");

    eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("dataUpdated", () => {
      console.log("[Relay] Received dataUpdated event from backend");
      EventBus.emit("dataUpdated");
    });

    eventSource.onerror = (error) => {
      console.error("[Relay] SSE error occurred:", error);

      // Handle SSE connection states
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn("[Relay] SSE connection closed by server. Reconnecting...");
        setTimeout(connect, 5000); // Retry after 5 seconds
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.warn("[Relay] SSE is retrying...");
      }
    };

    eventSource.addEventListener("open", () => {
      console.log("[Relay] SSE connection established.");
    });
  }

  connect(); // Initial connection attempt
}

export function closeRelay() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.log("[Relay] EventSource connection closed.");
  }
}

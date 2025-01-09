// src/services/relayService.js
import EventBus from "./eventBus";

let eventSource = null;

export function initializeRelay() {
  const baseUrl = process.env.VUE_APP_EVENT_BASE_URL;
  console.log("Environment Variables in relayService.js:", process.env); // DEBUG
  console.log("VUE_APP_API_BASE_URL:", process.env.VUE_APP_EVENT_BASE_URL); // DEBUG



  if (!eventSource) {
    const url = `${baseUrl}/events`;
    console.log(`[Relay] Initializing EventSource with URL: ${url}`);

    eventSource = new EventSource(url);

    eventSource.addEventListener("dataUpdated", () => {
      console.log("[Relay] Received dataUpdated event from backend");
      EventBus.emit("dataUpdated");
    });

    eventSource.onerror = (error) => {
      console.error("[Relay] SSE error occurred:", error);

      // Debug readyState for troubleshooting
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn("[Relay] SSE connection closed by server.");
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.warn("[Relay] SSE is retrying...");
      }
    };

    eventSource.addEventListener("open", () => {
      console.log("[Relay] SSE connection established.");
    });
  }
}

export function closeRelay() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.log("[Relay] EventSource connection closed.");
  }
}
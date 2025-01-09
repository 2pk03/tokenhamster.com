// src/services/relayService.js
import EventBus from "./eventBus";

let eventSource = null;

export function initializeRelay() {
  const baseUrl = process.env.VUE_APP_BACKEND_URL || "http://localhost:4467";

  if (!eventSource) {
    const url = `${baseUrl}/events`;
    console.log(`[Relay] Initializing EventSource with URL: ${url}`); // Debug

    eventSource = new EventSource(url);

    // Handle incoming dataUpdated events
    eventSource.addEventListener("dataUpdated", () => {
      console.log("[Relay] Received dataUpdated event from backend"); // Debug
      EventBus.emit("dataUpdated");
    });

    // Handle SSE errors
    eventSource.onerror = (error) => {
      console.error("[Relay] SSE error occurred:", error);

      // Check if the connection is closed and log additional info
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn("[Relay] SSE connection closed by server.");
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.warn("[Relay] SSE is retrying...");
      }
    };

    // Optional: Handle connection established event
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
// src/services/relayService.js
import EventBus from "./eventBus";

let eventSource = null;

export function initializeRelay() {
  const baseUrl = process.env.VUE_APP_API_BASE_URL || "http://localhost:4467";

  if (!eventSource) {
    eventSource = new EventSource(`${baseUrl}/events`);

    eventSource.addEventListener("dataUpdated", () => {
      // console.log("[Relay] Received dataUpdated event from backend"); // DEBUG
      EventBus.emit("dataUpdated"); // Emit event to frontend components
    });

    // DEBUG
    // eventSource.addEventListener("connected", (event) => {
      // console.log("[Relay] SSE connected:", event.data); 
    // });

    eventSource.onerror = (error) => {
      console.error("[Relay] SSE error:", error);
    };
  }
}

export function closeRelay() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.log("[Relay] EventSource connection closed.");
  }
}
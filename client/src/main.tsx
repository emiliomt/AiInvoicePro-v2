import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

try {
  createRoot(container).render(<App />);
} catch (error) {
  console.error("Failed to render app:", error);
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: Arial, sans-serif;">
      <div style="text-align: center;">
        <h2 style="color: #dc2626; margin-bottom: 8px;">Application Error</h2>
        <p style="color: #6b7280; margin-bottom: 16px;">Failed to load the application</p>
        <button onclick="window.location.reload()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    </div>
  `;
}

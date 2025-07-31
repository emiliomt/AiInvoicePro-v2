import { createRoot } from "react-dom/client";
import App from "./App";
import TestApp from "./test-app";
import "./index.css";

// Enhanced global error handlers with specific handling for Vite/WebSocket issues
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Handle WebSocket/Vite connection errors gracefully
  if (event.reason && typeof event.reason === 'object') {
    const reasonStr = String(event.reason);
    const errorMessage = event.reason.message || reasonStr;
    
    // Check for WebSocket-related errors
    if (errorMessage.includes('WebSocket') || 
        errorMessage.includes('Failed to construct') || 
        errorMessage.includes('connection') ||
        reasonStr.includes('WebSocket') ||
        event.reason.name === 'NetworkError') {
      console.warn('WebSocket/Network error handled gracefully:', errorMessage);
      event.preventDefault();
      return;
    }
    
    // Check for Vite HMR errors
    if (errorMessage.includes('vite') || 
        errorMessage.includes('HMR') ||
        errorMessage.includes('hot reload')) {
      console.warn('Vite HMR error handled gracefully:', errorMessage);
      event.preventDefault();
      return;
    }
  }
  
  // Prevent the default browser handling for all unhandled rejections
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  
  // Handle script loading errors
  if (event.error && (event.error.name === 'ChunkLoadError' || event.error.name === 'ScriptError')) {
    console.warn('Script/Chunk load error - possible network issue');
    return true; // Prevent default handling
  }
  
  return true; // Prevent default handling
});

// Additional handler for resource loading errors
window.addEventListener('error', (event) => {
  if (event.target !== window) {
    console.warn('Resource loading error:', event.target);
    event.preventDefault();
  }
}, true);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

// Enhanced error handling for React rendering
try {
  const root = createRoot(container);
  root.render(<TestApp />);
} catch (error) {
  console.error("Failed to render app:", error);
  
  // Show a more detailed error message
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: Arial, sans-serif; background: #f9fafb;">
      <div style="text-align: center; max-width: 500px; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h2 style="color: #dc2626; margin-bottom: 1rem; font-size: 1.5rem;">Application Failed to Load</h2>
        <p style="color: #6b7280; margin-bottom: 1rem; line-height: 1.5;">
          The application encountered an error during initialization. This might be due to network connectivity issues or temporary server problems.
        </p>
        <div style="margin-bottom: 1rem;">
          <button onclick="window.location.reload()" style="padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-right: 0.5rem;">
            Reload Page
          </button>
          <button onclick="window.location.href='/'" style="padding: 0.75rem 1.5rem; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem;">
            Go Home
          </button>
        </div>
        <details style="text-align: left; margin-top: 1rem;">
          <summary style="cursor: pointer; color: #6b7280; font-size: 0.875rem;">Technical Details</summary>
          <pre style="margin-top: 0.5rem; padding: 0.75rem; background: #f3f4f6; border-radius: 4px; font-size: 0.75rem; overflow: auto; color: #374151;">Error: ${errorMessage}</pre>
        </details>
      </div>
    </div>
  `;
}

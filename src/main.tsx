import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silence benign dev WebSocket and HMR errors in sandbox environment
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = event?.reason?.message || String(event?.reason);
    if (
      msg.includes("WebSocket") || 
      msg.includes("HMR") || 
      msg.includes("vite") || 
      msg.includes("ws://") ||
      msg.includes("wss://")
    ) {
      event.preventDefault();
      console.log("⚓ Silenced Sandboxed HMR/WebSocket Warning:", msg);
    }
  });

  window.addEventListener("error", (event) => {
    const msg = event?.message || "";
    if (
      msg.includes("WebSocket") || 
      msg.includes("HMR") || 
      msg.includes("vite")
    ) {
      event.preventDefault();
      console.log("⚓ Silenced Sandboxed Error:", msg);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

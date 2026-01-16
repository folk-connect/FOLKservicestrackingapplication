// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Login handler
  login: (credentials) => ipcRenderer.invoke("login", credentials),
  
  // Navigate to dashboard after login
  loginSuccess: () => ipcRenderer.send("login-success"),
  
  // ✅ Tracker control functions - now accept email parameter
  startTracking: (email) => {
    console.log("Preload: Sending start-tracking with email:", email);
    ipcRenderer.send("start-tracking", email);
  },
  
  stopTracking: () => {
    ipcRenderer.send("stop-tracking");
  },
  
  captureSnapshot: (email) => {
    console.log("Preload: Sending capture-snapshot with email:", email);
    ipcRenderer.send("capture-snapshot", email);
  },
});
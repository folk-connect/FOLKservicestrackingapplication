// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  login: (credentials) => ipcRenderer.invoke("login", credentials),
  
  loginSuccess: () => ipcRenderer.send("login-success"),
  
  // ✅ Tracker control functions
  startTracking: () => ipcRenderer.send("start-tracking"),
  
  stopTracking: () => ipcRenderer.send("stop-tracking"),
  
  captureSnapshot: () => ipcRenderer.send("capture-snapshot"),
});
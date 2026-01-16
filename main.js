// main.js
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { loginUser } = require("./airtableAuth");
const fs = require("fs");
require("./tracker");

let win;
Menu.setApplicationMenu(null);

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer/login.html"));
}

// ===============================
// LOGIN HANDLER
// ===============================
ipcMain.handle("login", async (_, creds) => {
  console.log("IPC login received:", creds.email);
  
  try {
    const user = await loginUser(creds.email, creds.password);
    
    if (user) {
      // ✅ Initialize tracker with employee email
      if (global.trackerFunctions && global.trackerFunctions.initialize) {
        console.log("🔧 Initializing tracker with email:", creds.email);
        await global.trackerFunctions.initialize(creds.email);
      }
    }
    
    return user;
  } catch (err) {
    console.error("Login error:", err);
    return null;
  }
});

ipcMain.on("login-success", () => {
  win.loadFile(path.join(__dirname, "renderer/dashboard.html"));
});

// ===============================
// TRACKER CONTROL HANDLERS
// ===============================

// ✅ Start tracking - now receives email from renderer
ipcMain.on("start-tracking", async (event, email) => {
  console.log("📡 IPC: Start tracking request received for:", email);
  
  if (global.trackerFunctions && global.trackerFunctions.startTracking) {
    await global.trackerFunctions.startTracking(email);
    console.log("✅ Tracking started");
  } else {
    console.error("❌ Tracker functions not available");
  }
});

// ✅ Stop tracking
ipcMain.on("stop-tracking", async () => {
  console.log("📡 IPC: Stop tracking request received");
  
  if (global.trackerFunctions && global.trackerFunctions.stopTracking) {
    await global.trackerFunctions.stopTracking();
    console.log("✅ Tracking stopped");
  } else {
    console.error("❌ Tracker functions not available");
  }
});

// ✅ Capture snapshot - now receives email from renderer
ipcMain.on("capture-snapshot", async (event, email) => {
  console.log("📡 IPC: Capture snapshot request received for:", email);
  
  if (global.trackerFunctions && global.trackerFunctions.captureSnapshot) {
    await global.trackerFunctions.captureSnapshot(email);
    console.log("✅ Snapshot captured");
  } else {
    console.error("❌ Tracker functions not available");
  }
});

// ===============================
// ERROR HANDLING
// ===============================
process.on("uncaughtException", err => {
  console.error("Uncaught:", err);
});

// ===============================
// APP LIFECYCLE
// ===============================
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
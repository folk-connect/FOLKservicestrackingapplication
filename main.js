// main.js
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { loginUser } = require("./airtableAuth");
const fs = require("fs");
require("dotenv").config();
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
  const user = await loginUser(creds.email, creds.password);

  if (!user) return null;

  // ✅ ONLY AIRTABLE DATA
  global.currentEmployee = user;
  

  console.log("✅ Logged in employee:", global.currentEmployee);
  return user;
});

ipcMain.on("login-success", () => {
  win.loadFile(path.join(__dirname, "renderer/dashboard.html"));
});

// ===============================
// TRACKER CONTROL HANDLERS
// ===============================

ipcMain.on("start-tracking", () => {
  console.log("📡 IPC: Start tracking request received");
  if (global.trackerFunctions && global.trackerFunctions.startTracking) {
    global.trackerFunctions.startTracking();
    console.log("✅ Tracking started");
  } else {
    console.error("❌ Tracker functions not available");
  }
});

ipcMain.on("stop-tracking", async () => {
  console.log("📡 IPC: Stop tracking request received");
  if (global.trackerFunctions && global.trackerFunctions.stopTracking) {
    await global.trackerFunctions.stopTracking();
    console.log("✅ Tracking stopped");
  } else {
    console.error("❌ Tracker functions not available");
  }
});

ipcMain.on("capture-snapshot", async () => {
  console.log("📡 IPC: Capture snapshot request received");
  if (global.trackerFunctions && global.trackerFunctions.captureSnapshot) {
    await global.trackerFunctions.captureSnapshot();
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
// main.js
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { loginUser } = require("./airtableAuth");
const fs = require("fs");
require("dotenv").config();
require("./tracker");

let win;
// Menu.setApplicationMenu(null);

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
      // ✅ Update .env with employee details for tracker
      const envPath = path.join(__dirname, ".env");
      const envContent = `EMPLOYEE_NAME=${user.name || user.Name || 'Unknown'}
EMPLOYEE_EMAIL=${user.email || user.Email || creds.email}
EMP_ID=${user.empId || user.EmpId || ''}`;
      
      try {
        fs.writeFileSync(envPath, envContent);
        console.log("✅ .env updated with employee details");
        
        // Reload environment variables
        require("dotenv").config();
      } catch (envErr) {
        console.error("❌ Failed to update .env:", envErr);
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
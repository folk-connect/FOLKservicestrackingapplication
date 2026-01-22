// main.js
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require("electron");
const { autoUpdater,AppUpdater } = require("electron-updater");
const AutoLaunch = require('electron-auto-launch');
const log = require("electron-log");
const path = require("path");
const { loginUser } = require("./airtableAuth");
const fs = require("fs");
require("./tracker");

let mainWindow = null;
let tray = null;
let win;


let curWindows;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function crearWindow() {
  curWindows = new BrowserWindow();
}
  
autoUpdater.on("update-downloaded", () => {
  const dialogOpts = {
    type: "info",
    buttons: ["Restart", "Later"],
    title: "Application Update",
    message: "A new version has been downloaded.",
    detail: "Click Restart to apply the updates."
  };

  const response = require("electron").dialog.showMessageBoxSync(dialogOpts);
  if (response === 0) autoUpdater.quitAndInstall();
});


autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
Menu.setApplicationMenu(null);

// ✅ FIX: Set custom cache path with proper permissions
app.setPath('userData', path.join(app.getPath('appData'), 'EmployeeTracker'));

// ✅ FIX: Disable GPU cache to avoid permission errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    icon: path.join(__dirname, "assets", "app.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // ✅ FIX: Disable cache in renderer
      cache: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer/login.html"));

  // ✅ PREVENT ACTUAL CLOSING - Minimize to tray instead
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
      
      // Show notification that app is still running
      if (tray) {
        tray.displayBalloon({
          title: 'Employee Tracker',
          content: 'App is still running in background. Tracking continues.'
        });
      }
    }
    return false;
  });
 
}

// ✅ CREATE SYSTEM TRAY ICON
function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGCSURBVFhH7ZbBTcMwFIZ/p0yQEToCGyAGgBEYgQ3oBsgGsAEjsAFsgBiB3qqe+v/SS2PHaUhToUr9pKhO/Pz5+dkOU+l0Op1O57+QZVmRpunSWrvgnNuapukjY8xHEATvSimdBPF4fJam6ZIxtmGMXWOMV4yxG8bYNWPsJoqij6IoXoIgeHVdF0+Gqqqe8jy/VUrdEUIeCSF7Qsie1rokhDwRQh5KpVK5VCqVTznnL0VRvE6iKIo3Xdc/rbVF27b7ruv2bduWXdftW2vLtm0LnPM9IeRRKbUnhOxRFEX5lOd5WVXVc13Xn03TfI/H491wONydTCY7Qsi2rusN53xDCNkQQjaEkDXn/J4Qsq6qat007Xc4HO5Oo+u6j7IsN5zze8bYPSFkzRhbE0JWnPMVIWTFOV9xzleM8xXnfMk5XxJClpzzJWNsyTlbcM4WhJA55+yOc3ZHCJkTQuaEkDkhZEYImRFCZpyxGWNsxhibEUKmnLEpY2xKGJsyxiaEsQkhZEwYGxPGxv4bUsovfRviILW7XfAAAAAASUVORK5CYII=');
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        win.show();
      }
    },
    {
      label: 'Tracking Status',
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit App (Stop Tracking)',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Employee Tracker - Running');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    win.show();
  });
}
autoUpdater.on("checking-for-update", () => {
  console.log("Checking for update...");
});

autoUpdater.on("update-available", () => {
  console.log("Update available");
});

autoUpdater.on("update-not-available", () => {
  console.log("No update available");
});

autoUpdater.on("error", err => {
  console.error("Update error:", err);
});

autoUpdater.on("update-downloaded", () => {
  console.log("Update downloaded, restarting...");
  autoUpdater.quitAndInstall();
});

// ✅ FIX: Setup auto-launch with better error handling
let autoLauncher = null;
let autoLaunchSupported = true;

try {
  autoLauncher = new AutoLaunch({
    name: 'Employee Tracker',
    path: app.getPath('exe'),
    isHidden: true
  });
} catch (err) {
  console.log('⚠️ AutoLaunch initialization failed:', err.message);
  autoLaunchSupported = false;
}

// ✅ FIX: Only try to enable if initialization succeeded
if (autoLauncher) {
  autoLauncher.enable()
    .then(() => console.log('✅ AutoLaunch enabled'))
    .catch(err => {
      console.log('⚠️ AutoLaunch could not be enabled (requires admin rights)');
      console.log('   App will work normally, but won\'t start automatically at login');
      autoLaunchSupported = false;
    });
}

// ===============================
// LOGIN HANDLER
// ===============================
ipcMain.handle("login", async (_, creds) => {
  console.log("IPC login received:", creds.email);
  
  try {
    const user = await loginUser(creds.email, creds.password);
    
    if (user) {
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

// ✅ FIX: Check if auto-launch is supported before attempting
ipcMain.handle("enable-autolaunch", async () => {
  if (!autoLaunchSupported || !autoLauncher) {
    return { 
      success: false, 
      error: 'Auto-start requires administrator privileges. Please run the app as administrator and try again.' 
    };
  }

  try {
    await autoLauncher.enable();
    const isEnabled = await autoLauncher.isEnabled();
    return { success: true, enabled: isEnabled };
  } catch (err) {
    console.error("AutoLaunch error:", err);
    return { 
      success: false, 
      error: 'Could not enable auto-start. Please run the app as administrator and try again.' 
    };
  }
});

// ✅ FIX: Check auto-launch status safely
ipcMain.handle("check-autolaunch", async () => {
  if (!autoLaunchSupported || !autoLauncher) {
    return { enabled: false, supported: false };
  }

  try {
    const isEnabled = await autoLauncher.isEnabled();
    return { enabled: isEnabled, supported: true };
  } catch (err) {
    return { enabled: false, supported: false };
  }
});

ipcMain.on("start-tracking", async (event, email) => {
  console.log("📡 IPC: Start tracking request received for:", email);
  
  if (global.trackerFunctions && global.trackerFunctions.startTracking) {
    await global.trackerFunctions.startTracking(email);
    console.log("✅ Tracking started");
    
    if (tray) {
      tray.setToolTip('Employee Tracker - Tracking Active');
    }
  } else {
    console.error("❌ Tracker functions not available");
  }
});

ipcMain.on("stop-tracking", async () => {
  console.log("📡 IPC: Stop tracking request received");
  
  if (global.trackerFunctions && global.trackerFunctions.stopTracking) {
    await global.trackerFunctions.stopTracking();
    console.log("✅ Tracking stopped");
    
    if (tray) {
      tray.setToolTip('Employee Tracker - Tracking Paused');
    }
  } else {
    console.error("❌ Tracker functions not available");
  }
});

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
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  const isHiddenStart = process.argv.includes('--hidden-start') || false;
  
  if (isHiddenStart) {
    win.hide();
    console.log("Starting in background mode...");
  }
});

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  autoUpdater.checkForUpdates();
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    win.show();
  }
});

app.on('before-quit', async () => {
  console.log("🛑 App is quitting, stopping tracking...");
  if (global.trackerFunctions && global.trackerFunctions.stopTracking) {
    await global.trackerFunctions.stopTracking();
  }
});
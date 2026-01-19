// tracker.js - PERSISTENT VERSION (Survives Restarts/Closures)

const os = require("os");
const fs = require("fs");
const path = require("path");

// ================================
// CONFIG & STATE FILE PATH
// ================================
// We save state in the user's home directory in a hidden file
const STATE_FILE_PATH = path.join(os.homedir(), ".employee_tracker_state.json");

const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_TABLE = "tblLGHzETj8CeRcTD"; // Activity Report Table
const AIRTABLE_ATT_TABLE = "tblra2QOaWz9AUbpr"; // Attendance table
const AIRTABLE_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";

const REPORT_COLS = {
  LINKED_EMPLOYEE_MAIL: "Linked Employee Mail",
  APP: "App",
  WEBSITE: "Website",
  TITLE: "Title",
  DURATION: "Duration",
  EMPLOYEE: "Employee",
  DEVICE: "Device",
  CATEGORY: "Category"
};

const EMPLOYEE_COLS = {
  ID: "empId",
  NAME: "name",
  EMAIL: "email",
  ROLE: "role"
};

// ================================
// ACTIVE-WIN SAFE IMPORT
// ================================
let activeWin;
try {
  const mod = require("active-win");
  activeWin = typeof mod === "function" ? mod : mod.default;
} catch (e) {
  console.error("active-win not available");
}

// ================================
// VARIABLES (Will be loaded from file if exists)
// ================================
let EMPLOYEE_EMAIL = null;
let EMPLOYEE_NAME = "Unknown";
let EMP_ID = "";
const DEVICE_NAME = os.hostname();

let currentApp = null;
let lastSwitchTime = Date.now();
let usageBuffer = {}; 
let lastFlushTime = Date.now(); 

global.isSignedIn = false;

// ================================
// STATE PERSISTENCE FUNCTIONS
// ================================

function saveStateToDisk() {
  const state = {
    EMPLOYEE_EMAIL,
    EMPLOYEE_NAME,
    EMP_ID,
    currentApp,
    lastSwitchTime,
    usageBuffer,
    lastFlushTime,
    isSignedIn: global.isSignedIn,
    lastSavedDate: new Date().toISOString().split("T")[0] // Track date to handle overnight resets
  };

  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state));
  } catch (err) {
    console.error("❌ Failed to save state to disk:", err);
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, "utf8");
      const state = JSON.parse(raw);
      
      const today = new Date().toISOString().split("T")[0];

      // If the saved state is from a previous day, we flush it or reset it
      // to avoid adding yesterday's seconds to today.
      if (state.lastSavedDate && state.lastSavedDate !== today) {
        console.log("📅 New day detected. Resetting buffer from previous day.");
        if (Object.keys(state.usageBuffer || {}).length > 0) {
           // Optional: You might want to flush yesterday's remaining buffer here
           // For now, we reset to ensure clean tracking for the new day
        }
        return null; // Return null to signal a fresh start
      }

      return state;
    }
  } catch (err) {
    console.error("❌ Error loading state from disk:", err);
  }
  return null;
}

// ================================
// INITIALIZATION & RECOVERY
// ================================

// ✅ Function to load employee details from Airtable
async function loadEmployeeDetails(email) {
  try {
    if (!email) {
      console.error("❌ No employee email provided");
      return false;
    }

    // Only fetch from Airtable if we don't have it, or if forced
    if (EMPLOYEE_EMAIL === email && EMPLOYEE_NAME !== "Unknown") {
      return true; 
    }

    EMPLOYEE_EMAIL = email;
    console.log("📧 Loading details for:", EMPLOYEE_EMAIL);

    const EMP_TABLE = "tblCBUHzzuXAPmcor";
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${EMP_TABLE}?filterByFormula={${EMPLOYEE_COLS.EMAIL}}='${EMPLOYEE_EMAIL}'`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` }
    });
    
    if (!res.ok) throw new Error(`Airtable API error: ${res.status}`);
    
    const data = await res.json();
    
    if (!data.records || data.records.length === 0) {
      console.error("❌ No employee found with email:", EMPLOYEE_EMAIL);
      return false;
    }
    
    const employeeData = data.records[0].fields;
    EMPLOYEE_NAME = employeeData[EMPLOYEE_COLS.NAME] || "Unknown";
    EMP_ID = employeeData[EMPLOYEE_COLS.ID] || "";
    
    // Update global state variables
    global.isSignedIn = true; 
    
    // Save the updated employee details to disk
    saveStateToDisk();
    
    return true;
    
  } catch (err) {
    console.error("Error loading employee details:", err);
    return false;
  }
}

// ================================
// CHECK SIGN-IN STATUS
// ================================
async function checkSignInStatus() {
  try {
    if (!EMPLOYEE_EMAIL) return;

    const today = new Date().toISOString().split("T")[0];
    const formula = `AND({email}='${EMPLOYEE_EMAIL}',{Date}='${today}',{Sign Out Time}='')`;
    const encodedFormula = encodeURIComponent(formula);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_ATT_TABLE}?filterByFormula=${encodedFormula}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` }
    });
    
    if (!res.ok) {
      console.error("Airtable error:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    const isCurrentlySignedIn = data.records && data.records.length > 0;
    
    // Handle State Change
    if (isCurrentlySignedIn && !global.isSignedIn) {
      console.log("✅ Employee signed in (Auto-detected) - tracking enabled");
      global.isSignedIn = true;
      usageBuffer = {};
      currentApp = null;
      lastSwitchTime = Date.now();
      lastFlushTime = Date.now();
      saveStateToDisk(); // Persist the "Signed In" status
    } else if (!isCurrentlySignedIn && global.isSignedIn) {
      console.log("⏸️ Employee signed out - tracking paused");
      global.isSignedIn = false;
      await flushToAirtable(); // Flush remaining data
    }
    
  } catch (err) {
    console.error("Error checking sign-in status:", err);
  }
}

// ================================
// TRACKING LOGIC
// ================================

async function captureAllWindows() {
  if (!activeWin) return [];
  try {
    const win = await activeWin();
    if (!win || !win.owner) return [];
    return [{
      appName: win.owner.name,
      title: win.title || "",
      timestamp: new Date().toISOString()
    }];
  } catch (err) {
    return [];
  }
}

function categorizeApp(appName) {
  const app = appName.toLowerCase();
  if (app.includes("chrome") || app.includes("firefox") || app.includes("safari") || app.includes("edge")) return "Web Browsing";
  if (app.includes("code") || app.includes("visual studio") || app.includes("sublime") || app.includes("atom")) return "Development";
  if (app.includes("slack") || app.includes("teams") || app.includes("zoom") || app.includes("meet")) return "Communication";
  if (app.includes("excel") || app.includes("word") || app.includes("powerpoint") || app.includes("sheets") || app.includes("docs")) return "Productivity";
  if (app.includes("photoshop") || app.includes("illustrator") || app.includes("figma") || app.includes("canva")) return "Design";
  return "Other";
}

function secondsBetween(a, b) {
  return Math.floor((b - a) / 1000);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function isValidAppTitle(app, title) {
  const a = app.toLowerCase();
  const t = title.toLowerCase();
  if (a.includes("chrome") && !t.includes("chrome")) return false;
  if (a.includes("code") && !(t.includes("visual studio") || t.includes(".js"))) return false;
  return true;
}

async function trackActiveApp() {
  try {
    // Only track if signed in
    if (!global.isSignedIn) return;
    if (!activeWin) return;
    if (!EMPLOYEE_EMAIL) return;

    const win = await activeWin();
    if (!win || !win.owner) return;

    const appName = win.owner.name;
    const title = win.title || "";

    if (!isValidAppTitle(appName, title)) return;

    const key = `${appName}||${title}`;
    const now = Date.now();
    const duration = secondsBetween(lastSwitchTime, now);

    // Logic to handle app switching
    if (currentApp && duration > 0) {
      usageBuffer[currentApp] ??= 0;
      usageBuffer[currentApp] += duration;
    }

    currentApp = key;
    lastSwitchTime = now;

    // ✅ SAVE STATE TO DISK every time we track (every 5s)
    // This ensures that if the app crashes NOW, we don't lose the last 5 seconds of data.
    saveStateToDisk();

  } catch (err) {
    console.error("Tracker error:", err.message);
  }
}

async function flushToAirtable() {
  if (!Object.keys(usageBuffer).length) {
    console.log("📭 No usage data to flush");
    return;
  }

  if (!EMPLOYEE_EMAIL) {
    console.error("❌ Cannot flush: No employee email");
    return;
  }

  console.log("☁️ Flushing data to Airtable...");

  const records = Object.entries(usageBuffer).map(([key, seconds]) => {
    const [app, title] = key.split("||");
    return {
      fields: {
        [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: EMPLOYEE_EMAIL,
        [REPORT_COLS.APP]: app,
        [REPORT_COLS.WEBSITE]: "",
        [REPORT_COLS.TITLE]: title,
        [REPORT_COLS.DURATION]: formatDuration(seconds),
        [REPORT_COLS.EMPLOYEE]: EMPLOYEE_NAME,
        [REPORT_COLS.DEVICE]: DEVICE_NAME,
        [REPORT_COLS.CATEGORY]: categorizeApp(app)
      }
    };
  });

  // Batch upload (Airtable limit is 10 per request)
  for (let i = 0; i < records.length; i += 10) {
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records: records.slice(i, i + 10) })
    });
  }

  usageBuffer = {};
  currentApp = null;
  lastSwitchTime = Date.now();
  lastFlushTime = Date.now();
  
  // Clear the local file after successful flush so we don't double count on restart
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      // We keep the file but empty the buffer inside it
      const currentState = JSON.parse(fs.readFileSync(STATE_FILE_PATH));
      currentState.usageBuffer = {};
      currentState.currentApp = null;
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(currentState));
    }
  } catch(e) { console.error("Error clearing state file", e); }

  console.log(`✅ Usage flushed (${records.length} records)`);
}

async function checkAndFlushIfNeeded() {
  if (!global.isSignedIn) return;
  const now = Date.now();
  const twoHoursInMs = 2 * 60 * 1000; // 2 hours in ms

  if (now - lastFlushTime >= twoHoursInMs) {
    console.log("⏰ 2 hours passed, flushing data...");
    await flushToAirtable();
  }
}

async function sendInitialSignInReport() {
  const windows = await captureAllWindows();
  if (!windows.length || !EMPLOYEE_EMAIL) return;

  const records = windows.map(win => ({
    fields: {
      [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: EMPLOYEE_EMAIL,
      [REPORT_COLS.APP]: win.appName,
      [REPORT_COLS.WEBSITE]: "",
      [REPORT_COLS.TITLE]: win.title || "Sign-in started",
      [REPORT_COLS.DURATION]: "0s",
      [REPORT_COLS.EMPLOYEE]: EMPLOYEE_NAME,
      [REPORT_COLS.DEVICE]: DEVICE_NAME,
      [REPORT_COLS.CATEGORY]: categorizeApp(win.appName)
    }
  }));

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records })
  });
  console.log("✅ Initial sign-in report sent");
}

// ================================
// EXPORTS
// ================================
global.trackerFunctions = {
  initialize: async (email) => {
    console.log("🔧 Initializing tracker...");
    
    // 1. Try to load state from disk first
    const savedState = loadStateFromDisk();

    if (savedState) {
      console.log("📂 Found saved state. Resuming...");
      // Restore variables
      EMPLOYEE_EMAIL = savedState.EMPLOYEE_EMAIL;
      EMPLOYEE_NAME = savedState.EMPLOYEE_NAME;
      EMP_ID = savedState.EMP_ID;
      currentApp = savedState.currentApp;
      lastSwitchTime = savedState.lastSwitchTime || Date.now();
      usageBuffer = savedState.usageBuffer || {};
      lastFlushTime = savedState.lastFlushTime || Date.now();
      global.isSignedIn = savedState.isSignedIn;

      // If the incoming email from login is different, update it
      if (email && email !== EMPLOYEE_EMAIL) {
        console.log("🔄 Email changed, reloading details...");
        await loadEmployeeDetails(email);
      }
    } else {
      console.log("🆕 No saved state. Fresh start.");
      // Fresh start based on passed email
      if (email) await loadEmployeeDetails(email);
    }

    // 2. Check Real-time Status on Airtable
    await checkSignInStatus();

    // 3. Start Intervals
    setInterval(checkSignInStatus, 30000);
    
    return true;
  },

  startTracking: async (email) => {
    console.log("🚀 Tracking started manually");
    if (email) await loadEmployeeDetails(email);
    global.isSignedIn = true;
    usageBuffer = {}; // Optional: Decide if manual start clears buffer
    currentApp = null;
    lastSwitchTime = Date.now();
    lastFlushTime = Date.now();
    saveStateToDisk();
    await sendInitialSignInReport();
  },
  
  stopTracking: async () => {
    console.log("⏸️ Tracking stopped manually");
    await flushToAirtable();
    global.isSignedIn = false;
    saveStateToDisk(); // Save signed-out state
  },
  
  captureSnapshot: async (email) => {
    if (email && !EMPLOYEE_EMAIL) await loadEmployeeDetails(email);
    const windows = await captureAllWindows();
    if (!windows.length) return;
    
    // Send snapshot immediately (fire and forget)
    const records = windows.map(win => ({
      fields: {
        [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: EMPLOYEE_EMAIL,
        [REPORT_COLS.APP]: win.appName,
        [REPORT_COLS.WEBSITE]: "",
        [REPORT_COLS.TITLE]: win.title,
        [REPORT_COLS.DURATION]: "0s",
        [REPORT_COLS.EMPLOYEE]: EMPLOYEE_NAME,
        [REPORT_COLS.DEVICE]: DEVICE_NAME,
        [REPORT_COLS.CATEGORY]: categorizeApp(win.appName)
      }
    }));

    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records })
    });
    console.log("✅ Snapshot sent");
  }
};

// ================================
// INTERVALS
// ================================
setInterval(trackActiveApp, 5000); // Track every 5s
setInterval(checkAndFlushIfNeeded, 60000); // Check flush every 1m

module.exports = {
  loadEmployeeDetails,
  trackerFunctions: global.trackerFunctions
};
// tracker.js

require("dotenv").config();
const os = require("os");

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
// AIRTABLE CONFIG
// ================================
const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_TABLE = "tblLGHzETj8CeRcTD"; // Activity Report Table (CORRECT ID)
const AIRTABLE_ATT_TABLE = "tblra2QOaWz9AUbpr"; // Attendance table
const AIRTABLE_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";

// ✅ CORRECT COLUMN NAMES matching tblLGHzETj8CeRcTD schema
// Based on Activity.js - but field names might be slightly different
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

// ✅ Function to test and discover actual field names
async function testFieldNames() {
  try {
    // Try to get one record to see the actual field structure
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?maxRecords=1`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        console.log("📋 Available fields in table:", Object.keys(data.records[0].fields));
      }
    }
  } catch (err) {
    console.error("Error checking field names:", err);
  }
}

// Call on startup
testFieldNames();

// ================================
// EMPLOYEE CONTEXT
// ================================
const EMPLOYEE_NAME = process.env.EMPLOYEE_NAME || "Unknown";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL || "unknown@email.com";
const EMP_ID = process.env.EMP_ID || "";
const DEVICE_NAME = os.hostname();

// ================================
// STATE (IN-MEMORY BUFFER)
// ================================
let currentApp = null;
let lastSwitchTime = Date.now();
let usageBuffer = {}; // { appName: { seconds, titles: Set } }
let lastFlushTime = Date.now(); // Track when last flush happened

// ✅ Track sign-in status
global.isSignedIn = false;

// ================================
// CHECK IF EMPLOYEE IS SIGNED IN
// ================================
async function checkSignInStatus() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const formula = `AND({email}='${EMPLOYEE_EMAIL}',{Date}='${today}',{Sign Out Time}='')`;
    const encodedFormula = encodeURIComponent(formula);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_ATT_TABLE}?filterByFormula=${encodedFormula}`;
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`
      }
    });
    
    if (!res.ok) {
      console.error("Airtable error:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    
    const wasSignedIn = global.isSignedIn;
    global.isSignedIn = data.records && data.records.length > 0;
    
    if (global.isSignedIn && !wasSignedIn) {
      console.log("✅ Employee signed in - tracking enabled");
      // Reset buffer when signing in
      usageBuffer = {};
      currentApp = null;
      lastSwitchTime = Date.now();
      lastFlushTime = Date.now(); // Reset flush timer
    } else if (!global.isSignedIn && wasSignedIn) {
      console.log("⏸️ Employee signed out - tracking paused");
      // Flush remaining data before stopping
      await flushToAirtable();
    }
    
  } catch (err) {
    console.error("Error checking sign-in status:", err);
    global.isSignedIn = false;
  }
}

// ✅ Check sign-in status every 30 seconds
setInterval(checkSignInStatus, 30000);
checkSignInStatus(); // Initial check

// ================================
// GET EMPLOYEE RECORD ID
// ================================
async function getEmployeeRecordId() {
  try {
    const EMP_TABLE = "tblCBUHzzuXAPmcor";
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${EMP_TABLE}?filterByFormula={email}='${EMPLOYEE_EMAIL}'`;
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`
      }
    });
    
    const data = await res.json();
    
    if (data.records && data.records.length > 0) {
      return data.records[0].id;
    }
    
    return null;
  } catch (err) {
    console.error("Error getting employee record ID:", err);
    return null;
  }
}

// ================================
// CAPTURE SNAPSHOT OF ALL WINDOWS
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
    console.error("Error capturing windows:", err);
    return [];
  }
}

// ================================
// CATEGORIZE APP
// ================================
function categorizeApp(appName) {
  const app = appName.toLowerCase();
  
  if (app.includes("chrome") || app.includes("firefox") || app.includes("safari") || app.includes("edge")) {
    return "Web Browsing";
  }
  if (app.includes("code") || app.includes("visual studio") || app.includes("sublime") || app.includes("atom")) {
    return "Development";
  }
  if (app.includes("slack") || app.includes("teams") || app.includes("zoom") || app.includes("meet")) {
    return "Communication";
  }
  if (app.includes("excel") || app.includes("word") || app.includes("powerpoint") || app.includes("sheets") || app.includes("docs")) {
    return "Productivity";
  }
  if (app.includes("photoshop") || app.includes("illustrator") || app.includes("figma") || app.includes("canva")) {
    return "Design";
  }
  
  return "Other";
}

// ================================
// SEND SNAPSHOT TO AIRTABLE
// ================================
async function sendSnapshotToAirtable(windows) {
  if (!windows.length) return;

  const records = windows.map(win => {
    const fields = {
      [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: EMPLOYEE_EMAIL,
      [REPORT_COLS.APP]: win.appName,
      [REPORT_COLS.WEBSITE]: "", // OS limitation
      [REPORT_COLS.TITLE]: win.title || "No title",
      [REPORT_COLS.DURATION]: "0s",
      [REPORT_COLS.EMPLOYEE]: EMPLOYEE_NAME,
      [REPORT_COLS.DEVICE]: DEVICE_NAME,
      [REPORT_COLS.CATEGORY]: categorizeApp(win.appName)
    };

    return { fields };
  });

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records })
  });

  console.log("✅ Snapshot saved");
}


// ================================
// SEND INITIAL SIGN-IN REPORT
// ================================
async function sendSnapshotToAirtable(windows) {
  if (!windows.length) return;

  const records = windows.map(win => {
    const fields = {
      [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: EMPLOYEE_EMAIL,
      [REPORT_COLS.APP]: win.appName,
      [REPORT_COLS.WEBSITE]: "", // OS limitation
      [REPORT_COLS.TITLE]: win.title || "No title",
      [REPORT_COLS.DURATION]: "0s",
      [REPORT_COLS.EMPLOYEE]: EMPLOYEE_NAME,
      [REPORT_COLS.DEVICE]: DEVICE_NAME,
      [REPORT_COLS.CATEGORY]: categorizeApp(win.appName)
    };

    return { fields };
  });

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records })
  });

  console.log("✅ Snapshot saved");
}


// ================================
// UTIL
// ================================
function secondsBetween(a, b) {
  return Math.floor((b - a) / 1000);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}


function isValidAppTitle(app, title) {
  const a = app.toLowerCase();
  const t = title.toLowerCase();

  // Chrome titles MUST contain "chrome"
  if (a.includes("chrome") && !t.includes("chrome")) return false;

  // VS Code titles MUST contain "visual studio code" or ".js"
  if (a.includes("code") && !(t.includes("visual studio") || t.includes(".js"))) {
    return false;
  }

  return true;
}

// ================================
// TRACK ACTIVE APP (NO DB CALLS)
// ================================
async function trackActiveApp() {
  try {
    if (!global.isSignedIn) return;
    if (!activeWin) return;

    const win = await activeWin();
    if (!win || !win.owner) return;

    const appName = win.owner.name;
    const title = win.title || "";

    // 🚫 FILTER WRONG APP–TITLE COMBINATIONS
    if (!isValidAppTitle(appName, title)) {
      return;
    }

    const key = `${appName}||${title}`;
    const now = Date.now();
    const duration = secondsBetween(lastSwitchTime, now);

    if (currentApp && duration > 0) {
      usageBuffer[currentApp] ??= 0;
      usageBuffer[currentApp] += duration;
    }

    currentApp = key;
    lastSwitchTime = now;

  } catch (err) {
    console.error("Tracker error:", err.message);
  }
}


// ================================
// FLUSH TO AIRTABLE (EVERY 2 HOURS)
// ================================
async function flushToAirtable() {
  if (!Object.keys(usageBuffer).length) {
    console.log("📭 No usage data");
    return;
  }

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

  console.log(`✅ Usage flushed (${records.length} records)`);
}

// ================================
// CHECK IF 2 HOURS PASSED
// ================================
async function checkAndFlushIfNeeded() {
  if (!global.isSignedIn) return;
  
  const now = Date.now();
  const twoHoursInMs = 2 * 60 * 60 * 1000;
  // const twoHoursInMs = 2 * 60 * 1000;

  if (now - lastFlushTime >= twoHoursInMs) {
    console.log("⏰ 2 hours passed, flushing data...");
    await flushToAirtable();
  }
}
async function sendInitialSignInReport() {
  const windows = await captureAllWindows();
  if (!windows.length) return;

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
// EXPORT FUNCTIONS FOR IPC
// ================================
global.trackerFunctions = {
  startTracking: async () => {
    console.log("🚀 Tracking started by dashboard");
    global.isSignedIn = true;
    usageBuffer = {};
    currentApp = null;
    lastSwitchTime = Date.now();
    lastFlushTime = Date.now(); // Reset flush timer
    
    // ✅ Send initial sign-in report immediately
    await sendInitialSignInReport();
  },
  
  


  stopTracking: async () => {
    console.log("⏸️ Tracking stopped by dashboard");
    await flushToAirtable(); // Final flush
    global.isSignedIn = false;
  },
  
  captureSnapshot: async () => {
    console.log("📸 Capturing initial snapshot");
    const windows = await captureAllWindows();
    await sendSnapshotToAirtable(windows);
  }
};

// ================================
// INTERVALS
// ================================
setInterval(trackActiveApp, 5000); // Track every 5 seconds
setInterval(checkAndFlushIfNeeded, 60000); // Check every minute if 2 hours passed

console.log("🚀 Employee tracker started");
console.log(`👤 Employee: ${EMPLOYEE_NAME} (${EMPLOYEE_EMAIL})`);
console.log(`💻 Device: ${DEVICE_NAME}`);
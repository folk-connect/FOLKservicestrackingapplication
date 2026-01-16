// tracker.js - MODIFIED TO USE LOCALSTORAGE

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
const AIRTABLE_TABLE = "tblLGHzETj8CeRcTD"; // Activity Report Table
const AIRTABLE_ATT_TABLE = "tblra2QOaWz9AUbpr"; // Attendance table
const AIRTABLE_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";

// ✅ CORRECT COLUMN NAMES matching tblLGHzETj8CeRcTD schema
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
// EMPLOYEE CONTEXT (PASSED VIA IPC)
// ================================
let EMPLOYEE_EMAIL = null;
let EMPLOYEE_NAME = "Unknown";
let EMP_ID = "";
const DEVICE_NAME = os.hostname();

// ✅ Function to load employee details from Airtable using email passed from renderer
async function loadEmployeeDetails(email) {
  try {
    // ✅ Email is now passed as a parameter from the renderer process
    if (!email) {
      console.error("❌ No employee email provided");
      return false;
    }

    EMPLOYEE_EMAIL = email;

    console.log("📧 Loading details for:", EMPLOYEE_EMAIL);

    // Fetch employee details from Airtable
    const EMP_TABLE = "tblCBUHzzuXAPmcor";
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${EMP_TABLE}?filterByFormula={${EMPLOYEE_COLS.EMAIL}}='${EMPLOYEE_EMAIL}'`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_KEY}`
      }
    });
    
    if (!res.ok) {
      throw new Error(`Airtable API error: ${res.status}`);
    }
    
    const data = await res.json();
    
    if (!data.records || data.records.length === 0) {
      console.error("❌ No employee found with email:", EMPLOYEE_EMAIL);
      return false;
    }
    
    const employeeData = data.records[0].fields;
    
    // ✅ Set employee details from Airtable
    EMPLOYEE_NAME = employeeData[EMPLOYEE_COLS.NAME] || "Unknown";
    EMP_ID = employeeData[EMPLOYEE_COLS.ID] || "";
    
    console.log("✅ Employee details loaded:");
    console.log(`   Name: ${EMPLOYEE_NAME}`);
    console.log(`   Email: ${EMPLOYEE_EMAIL}`);
    console.log(`   ID: ${EMP_ID}`);
    console.log(`   Device: ${DEVICE_NAME}`);
    
    return true;
    
  } catch (err) {
    console.error("Error loading employee details:", err);
    return false;
  }
}

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
    if (!EMPLOYEE_EMAIL) {
      console.log("⚠️ No employee email available yet");
      return;
    }

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
  if (!EMPLOYEE_EMAIL) {
    console.error("❌ Cannot send snapshot: No employee email");
    return;
  }

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
    if (!EMPLOYEE_EMAIL) return;

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

  if (!EMPLOYEE_EMAIL) {
    console.error("❌ Cannot flush: No employee email");
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
  if (!EMPLOYEE_EMAIL) return;
  
  const now = Date.now();
  const twoHoursInMs = 2 * 60 * 60 * 1000;

  if (now - lastFlushTime >= twoHoursInMs) {
    console.log("⏰ 2 hours passed, flushing data...");
    await flushToAirtable();
  }
}

// ================================
// SEND INITIAL SIGN-IN REPORT
// ================================
async function sendInitialSignInReport() {
  const windows = await captureAllWindows();
  if (!windows.length) return;
  if (!EMPLOYEE_EMAIL) {
    console.error("❌ Cannot send initial report: No employee email");
    return;
  }

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
  // ✅ Initialize tracker with employee email passed from renderer
  initialize: async (email) => {
    console.log("🔧 Initializing tracker with email:", email);
    const success = await loadEmployeeDetails(email);
    if (success) {
      // Check initial sign-in status after loading employee details
      await checkSignInStatus();
      // Start intervals only after successful initialization
      setInterval(checkSignInStatus, 30000); // Check every 30 seconds
    }
    return success;
  },

  startTracking: async (email) => {
    console.log("🚀 Tracking started by dashboard");
    
    // ✅ Load employee details with the email from renderer
    if (email) {
      await loadEmployeeDetails(email);
    }
    
    global.isSignedIn = true;
    usageBuffer = {};
    currentApp = null;
    lastSwitchTime = Date.now();
    lastFlushTime = Date.now();
    
    // ✅ Send initial sign-in report immediately
    await sendInitialSignInReport();
  },
  
  stopTracking: async () => {
    console.log("⏸️ Tracking stopped by dashboard");
    await flushToAirtable(); // Final flush
    global.isSignedIn = false;
  },
  
  captureSnapshot: async (email) => {
    console.log("📸 Capturing initial snapshot");
    
    // ✅ Load employee details if email provided
    if (email && !EMPLOYEE_EMAIL) {
      await loadEmployeeDetails(email);
    }
    
    const windows = await captureAllWindows();
    await sendSnapshotToAirtable(windows);
  },

  // ✅ Allow manual employee email update
  updateEmployeeEmail: async (email) => {
    EMPLOYEE_EMAIL = email;
    await loadEmployeeDetails();
  }
};

// ================================
// INTERVALS
// ================================
setInterval(trackActiveApp, 5000); // Track every 5 seconds
setInterval(checkAndFlushIfNeeded, 60000); // Check every minute if 2 hours passed

console.log("🚀 Employee tracker started");
console.log("⏳ Waiting for employee data from localStorage...");

// ✅ Export the loadEmployeeDetails function for external initialization
module.exports = {
  loadEmployeeDetails,
  trackerFunctions: global.trackerFunctions
};
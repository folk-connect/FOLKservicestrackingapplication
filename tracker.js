const os = require("os");

// ================================
// ACTIVE-WIN SAFE IMPORT
// ================================
let activeWin;
try {
  const mod = require("active-win");
  activeWin = typeof mod === "function" ? mod : mod.default;
} catch {
  console.error("❌ active-win not available");
}

// ================================
// AIRTABLE CONFIG
// ================================
const AIRTABLE_BASE = "appSLR442m2qPFvxZ";
const AIRTABLE_TABLE = "tblLGHzETj8CeRcTD";
const AIRTABLE_ATT_TABLE = "tblra2QOaWz9AUbpr";
const AIRTABLE_KEY = "patXXXXXXXXXXXX";

const DEVICE_NAME = os.hostname();

// ================================
// REPORT COLUMNS
// ================================
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

// ================================
// GLOBAL STATE
// ================================
let currentApp = null;
let lastSwitchTime = Date.now();
let usageBuffer = {};
let lastFlushTime = Date.now();

global.isSignedIn = false;

// ================================
// EMPLOYEE ACCESS (ONLY SOURCE)
// ================================
function getEmployee() {
  if (!global.currentEmployee) {
    throw new Error("Employee not logged in");
  }
  return global.currentEmployee;
}

// ================================
// CHECK SIGN-IN STATUS (ATTENDANCE)
// ================================
async function checkSignInStatus() {
  if (!global.currentEmployee) return;

  try {
    const emp = getEmployee();
    const today = new Date().toISOString().split("T")[0];

    const formula = `AND({email}='${emp.email}',{Date}='${today}',{Sign Out Time}='')`;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_ATT_TABLE}?filterByFormula=${encodeURIComponent(formula)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` }
    });

    const data = await res.json();
    const wasSignedIn = global.isSignedIn;
    global.isSignedIn = data.records?.length > 0;

    if (global.isSignedIn && !wasSignedIn) {
      console.log("✅ Employee signed in — tracking active");
      usageBuffer = {};
      currentApp = null;
      lastSwitchTime = Date.now();
      lastFlushTime = Date.now();
    }

    if (!global.isSignedIn && wasSignedIn) {
      console.log("⏸️ Employee signed out — flushing data");
      await flushToAirtable();
    }

  } catch (err) {
    console.error("Sign-in check error:", err.message);
  }
}

setInterval(checkSignInStatus, 30000);

// ================================
// WINDOW SNAPSHOT
// ================================
async function captureAllWindows() {
  if (!activeWin) return [];
  const win = await activeWin();
  if (!win?.owner) return [];
  return [{ appName: win.owner.name, title: win.title || "" }];
}

// ================================
// APP CATEGORY
// ================================
function categorizeApp(app) {
  const a = app.toLowerCase();
  if (a.includes("chrome")) return "Web Browsing";
  if (a.includes("code")) return "Development";
  if (a.includes("slack") || a.includes("teams")) return "Communication";
  if (a.includes("excel") || a.includes("word")) return "Productivity";
  return "Other";
}

// ================================
// TRACK ACTIVE APP
// ================================
async function trackActiveApp() {
  if (!global.isSignedIn || !activeWin) return;

  const win = await activeWin();
  if (!win?.owner) return;

  const key = `${win.owner.name}||${win.title || ""}`;
  const now = Date.now();
  const duration = Math.floor((now - lastSwitchTime) / 1000);

  if (currentApp && duration > 0) {
    usageBuffer[currentApp] ??= 0;
    usageBuffer[currentApp] += duration;
  }

  currentApp = key;
  lastSwitchTime = now;
}

// ================================
// FLUSH TO AIRTABLE
// ================================
async function flushToAirtable() {
  if (!Object.keys(usageBuffer).length) return;

  const emp = getEmployee();

  const records = Object.entries(usageBuffer).map(([key, sec]) => {
    const [app, title] = key.split("||");
    return {
      fields: {
        [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: emp.email,
        [REPORT_COLS.APP]: app,
        [REPORT_COLS.TITLE]: title,
        [REPORT_COLS.DURATION]: `${sec}s`,
        [REPORT_COLS.EMPLOYEE]: emp.name,
        [REPORT_COLS.DEVICE]: DEVICE_NAME,
        [REPORT_COLS.CATEGORY]: categorizeApp(app)
      }
    };
  });

  for (let i = 0; i < records.length; i += 10) {
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
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
  lastFlushTime = Date.now();

  console.log("✅ Usage flushed");
}

// ================================
// INITIAL SIGN-IN SNAPSHOT
// ================================
async function sendInitialSignInReport() {
  if (!global.currentEmployee) return;

  const emp = getEmployee();
  const windows = await captureAllWindows();
  if (!windows.length) return;

  const records = windows.map(win => ({
    fields: {
      [REPORT_COLS.LINKED_EMPLOYEE_MAIL]: emp.email,
      [REPORT_COLS.APP]: win.appName,
      [REPORT_COLS.TITLE]: win.title || "Sign-in started",
      [REPORT_COLS.DURATION]: "0s",
      [REPORT_COLS.EMPLOYEE]: emp.name,
      [REPORT_COLS.DEVICE]: DEVICE_NAME,
      [REPORT_COLS.CATEGORY]: categorizeApp(win.appName)
    }
  }));

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
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
// IPC EXPORTS
// ================================
global.trackerFunctions = {
  startTracking: async () => {
    if (!global.currentEmployee) {
      console.log("❌ Cannot start tracking — no employee logged in");
      return;
    }
    global.isSignedIn = true;
    usageBuffer = {};
    lastSwitchTime = Date.now();
    lastFlushTime = Date.now();
    await sendInitialSignInReport();
  },

  stopTracking: async () => {
    await flushToAirtable();
    global.isSignedIn = false;
  }
};

// ================================
// INTERVALS
// ================================
setInterval(trackActiveApp, 5000);
setInterval(() => {
  if (Date.now() - lastFlushTime > 2 * 60 * 60 * 1000) {
    flushToAirtable();
  }
}, 60000);

console.log("🚀 Tracker initialized");

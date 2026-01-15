// dashboard.js

// ===============================
// CONFIG
// ===============================
const AIRTABLE_BASE_ID = "appSLR442m2qPFvxZ";
const AIRTABLE_API_KEY = "patXjzoqxNqbNs57B.9378e5431950e7b5c91fdc3015111bbf6c8f316a9de5477922c64ef98f205dfd";

const EMP_TABLE = "tblCBUHzzuXAPmcor";
const ATT_TABLE = "tblra2QOaWz9AUbpr";

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  "Content-Type": "application/json"
};

// ✅ CORRECT COLUMN NAMES from your Airtable
const EMPLOYEE_COLS = {
  ID: "empId",
  NAME: "name",
  EMAIL: "email",
  ROLE: "role",
  PASSWORD: "password",
  ACTIVE_STATUS: "Active Status",
  HIRE_DATE: "HireDate",
  DEPARTMENT: "Department",
  PHOTO: "Photo"
};

const ATTENDANCE_COLS = {
  EMP_ID: "empId",
  NAME: "name",
  EMAIL: "email",
  ROLE: "role",
  DATE: "Date",
  SIGN_IN: "Sign In Time",
  SIGN_OUT: "Sign Out Time",
  NOTES: "Notes",
  WORKING_HOURS: "Working Hours"
};

// ===============================
// GLOBAL STATE
// ===============================
const EMP_EMAIL = localStorage.getItem("employeeEmail");
if (!EMP_EMAIL) {
  location.replace("index.html");
}

const today = new Date().toISOString().split("T")[0];
let activeAttendanceId = null;
let employeeData = null;
let timerInterval = null;
let timerStartTime = null;
let signInTime = null; // Track actual sign-in time

// ===============================
// TIMER FUNCTIONS
// ===============================
function startTimer(startTime) {
  if (timerInterval) return;
  
  // If startTime provided (from existing sign-in), calculate from that time
  const referenceTime = startTime ? new Date(startTime).getTime() : Date.now();
  timerStartTime = referenceTime;
  
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const elapsed = Date.now() - timerStartTime;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  
  document.getElementById("timer").textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  document.getElementById("timer").textContent = "00:00:00";
}

// ===============================
// NOTIFY ELECTRON TRACKER
// ===============================
function notifyTrackerSignIn() {
  if (window.api && window.api.startTracking) {
    window.api.startTracking();
  }
}

function notifyTrackerSignOut() {
  if (window.api && window.api.stopTracking) {
    window.api.stopTracking();
  }
}

function captureInitialSnapshot() {
  if (window.api && window.api.captureSnapshot) {
    window.api.captureSnapshot();
  }
}

// ===============================
// PAGE SWITCH
// ===============================
function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("d-none"));
  document.getElementById(`page-${page}`).classList.remove("d-none");

  document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");

  if (page === "history") loadAttendanceHistory();
}

// ===============================
// LOAD EMPLOYEE DETAILS
// ===============================
async function loadEmployeeDetails() {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EMP_TABLE}?filterByFormula={${EMPLOYEE_COLS.EMAIL}}='${EMP_EMAIL}'`;

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      throw new Error(`Airtable API error: ${res.status}`);
    }
    
    const data = await res.json();
    
    if (!data.records || data.records.length === 0) {
      console.error("No employee found with email:", EMP_EMAIL);
      alert("Employee not found in database");
      return;
    }
    
    employeeData = data.records[0].fields;

    // Update UI
    document.getElementById("userName").textContent = employeeData[EMPLOYEE_COLS.NAME] || "Employee";
    document.getElementById("userRole").textContent = employeeData[EMPLOYEE_COLS.ROLE] || "Employee";
    document.getElementById("greetingName").textContent = employeeData[EMPLOYEE_COLS.NAME] || "Employee";

    document.getElementById("profileName").textContent = employeeData[EMPLOYEE_COLS.NAME] || "N/A";
    document.getElementById("profileRole").textContent = employeeData[EMPLOYEE_COLS.ROLE] || "N/A";
    document.getElementById("profileEmpId").value = employeeData[EMPLOYEE_COLS.ID] || "N/A";
    document.getElementById("profileEmail").value = employeeData[EMPLOYEE_COLS.EMAIL] || "N/A";
    document.getElementById("profileDepartment").value = employeeData[EMPLOYEE_COLS.DEPARTMENT] || "N/A";
    document.getElementById("profilePhone").value = employeeData.Phone || "N/A";

    const initial = employeeData[EMPLOYEE_COLS.NAME] ? employeeData[EMPLOYEE_COLS.NAME][0].toUpperCase() : "E";
    document.getElementById("avatar").textContent = initial;
    document.getElementById("profileAvatar").textContent = initial;
    
  } catch (err) {
    console.error("Error loading employee details:", err);
    alert("Failed to load employee data. Check console for details.");
  }
}

// ===============================
// CHECK ACTIVE SIGN-IN
// ===============================
async function checkActiveSignIn() {
  try {
    // ✅ FIXED: Properly encode the filter formula
    const formula = `AND({email}='${EMP_EMAIL}',{Date}='${today}',{Sign Out Time}='')`;
    const encodedFormula = encodeURIComponent(formula);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ATT_TABLE}?filterByFormula=${encodedFormula}`;

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      console.error("Airtable error:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();

    if (data.records && data.records.length > 0) {
      // ✅ Employee has already signed in today and not signed out
      const record = data.records[0];
      activeAttendanceId = record.id;
      signInTime = record.fields[ATTENDANCE_COLS.SIGN_IN];
      
      document.getElementById("signInBtn").disabled = true;
      document.getElementById("signOutBtn").disabled = false;
      
      // Start timer from the existing sign-in time
      startTimer(signInTime);
      
      // Notify tracker to resume
      notifyTrackerSignIn();
      
      // Show message to user
      const signInDate = new Date(signInTime);
      alert(`You're already signed in from ${signInDate.toLocaleTimeString()}. Please sign out to complete your attendance.`);
      
    } else {
      // ✅ No active sign-in, enable sign in button
      document.getElementById("signInBtn").disabled = false;
      document.getElementById("signOutBtn").disabled = true;
      stopTimer();
    }
  } catch (err) {
    console.error("Error checking sign-in status:", err);
  }
}

// ===============================
// INITIALIZE
// ===============================
async function initialize() {
  await loadEmployeeDetails();
  await checkActiveSignIn();
}

// ✅ Call after DOM loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// ===============================
// SIGN IN
// ===============================
document.getElementById("signInBtn").onclick = async () => {
  if (activeAttendanceId) {
    alert("Already signed in!");
    return;
  }

  if (!employeeData) {
    alert("Employee data not loaded. Please refresh.");
    return;
  }

  try {
    signInTime = new Date().toISOString();
    
    const payload = {
      fields: {
        [ATTENDANCE_COLS.EMP_ID]: employeeData[EMPLOYEE_COLS.ID],
        [ATTENDANCE_COLS.NAME]: employeeData[EMPLOYEE_COLS.NAME],
        [ATTENDANCE_COLS.EMAIL]: EMP_EMAIL,
        [ATTENDANCE_COLS.ROLE]: employeeData[EMPLOYEE_COLS.ROLE],
        [ATTENDANCE_COLS.DATE]: today,
        [ATTENDANCE_COLS.SIGN_IN]: signInTime
      }
    };

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ATT_TABLE}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to sign in: ${res.status}`);
    }

    const data = await res.json();
    activeAttendanceId = data.id;

    document.getElementById("signInBtn").disabled = true;
    document.getElementById("signOutBtn").disabled = false;
    
    // Start timer from now
    startTimer(signInTime);
    
    // ✅ Capture initial snapshot of all open windows/tabs
    captureInitialSnapshot();
    
    // ✅ Notify tracker to start tracking
    notifyTrackerSignIn();
    
    alert("Signed in successfully! All activity tracking has started.");
    
  } catch (err) {
    console.error("Sign in error:", err);
    alert("Failed to sign in. Check console.");
  }
};

// ===============================
// SIGN OUT
// ===============================
document.getElementById("signOutBtn").onclick = async () => {
  if (!activeAttendanceId) {
    alert("Not signed in!");
    return;
  }

  const notes = document.getElementById("workDone").value.trim();
  if (notes.split(/\s+/).length < 10) {
    alert("Please describe your work in at least 10 words");
    return;
  }

  try {
    const signOutTime = new Date().toISOString();
    
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ATT_TABLE}/${activeAttendanceId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: {
            [ATTENDANCE_COLS.SIGN_OUT]: signOutTime,
            [ATTENDANCE_COLS.NOTES]: notes
          }
        })
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to sign out: ${res.status}`);
    }

    // ✅ Notify tracker to stop
    notifyTrackerSignOut();
    
    activeAttendanceId = null;
    signInTime = null;
    document.getElementById("signInBtn").disabled = false;
    document.getElementById("signOutBtn").disabled = true;
    document.getElementById("workDone").value = "";
    
    stopTimer();
    
    alert("Signed out successfully! Activity tracking has stopped.");
    
  } catch (err) {
    console.error("Sign out error:", err);
    alert("Failed to sign out. Check console.");
  }
};

// ===============================
// LOAD HISTORY
// ===============================
async function loadAttendanceHistory() {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ATT_TABLE}?filterByFormula={${ATTENDANCE_COLS.EMAIL}}='${EMP_EMAIL}'&sort[0][field]=${ATTENDANCE_COLS.DATE}&sort[0][direction]=desc`;

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      throw new Error(`Failed to load history: ${res.status}`);
    }
    
    const data = await res.json();

    const tbody = document.getElementById("workLogs");
    tbody.innerHTML = "";

    if (!data.records || data.records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">No attendance records found</td></tr>';
      return;
    }

    data.records.forEach(r => {
      const f = r.fields;
      const signIn = f[ATTENDANCE_COLS.SIGN_IN] ? new Date(f[ATTENDANCE_COLS.SIGN_IN]).toLocaleTimeString() : "-";
      const signOut = f[ATTENDANCE_COLS.SIGN_OUT] ? new Date(f[ATTENDANCE_COLS.SIGN_OUT]).toLocaleTimeString() : "-";
      
      tbody.innerHTML += `
        <tr>
          <td>${f[ATTENDANCE_COLS.DATE] || "-"}</td>
          <td>${signIn}</td>
          <td>${signOut}</td>
          <td>${f[ATTENDANCE_COLS.NOTES] || "-"}</td>
          <td>${f[ATTENDANCE_COLS.WORKING_HOURS] || "-"}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Error loading history:", err);
    document.getElementById("workLogs").innerHTML = 
      '<tr><td colspan="5" class="text-center text-danger">Failed to load history</td></tr>';
  }
}
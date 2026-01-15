# FOLK Services Tracking Application

🚀 **Cross-platform Employee Activity Tracker**  
Built using **Electron**, this application helps the temple office monitor employee work activity in a secure and efficient way.  
Supports **Windows** and **macOS**.

---

## 📦 Application Versions

We follow a structured versioning system to track features, fixes, and improvements.

### 🔢 Version Format


| Part  | Meaning |
|-------|--------|
| MAJOR | Big changes, redesigns, or breaking updates |
| MINOR | New features and improvements |
| PATCH | Bug fixes and small updates |

---

## 🗂️ Release History

### ✅ v1.0.0 — Initial Release
📅 Date: 2026-01-15  
- First stable release  
- Employee activity tracking enabled  
- Windows (.exe) and macOS (.dmg) support  
- PostgreSQL integration  
- Secure API communication using Axios  

---

### 🔧 v1.0.1 — Bug Fix Update
📅 Date: 2026-01-20  
- Fixed app startup crash on Windows  
- Improved background process handling  
- Minor UI fixes  

---

### ✨ v1.1.0 — Feature Update
📅 Date: 2026-02-05  
- Added real-time sync with admin dashboard  
- Improved activity detection accuracy  
- Enhanced logging system  

---

### 🚀 v2.0.0 — Major Upgrade (Planned)
📅 Date: Coming Soon  
- UI redesign  
- Role-based access (Admin / Employee)  
- Auto-update support  
- Performance optimization  

---

## 💻 Supported Platforms

| Platform | Installer |
|---------|------------|
| Windows | `.exe` |
| macOS   | `.dmg` |

---

## 🔽 Download

Download the latest version from the official website:

👉 **https://your-website.com/download**

*(Automatically detects OS and downloads the correct installer.)*

---

## ⚙️ Tech Stack

- **Electron** – Cross-platform desktop app  
- **Node.js** – Backend services  
- **PostgreSQL (pg)** – Database  
- **Axios** – API communication  
- **dotenv** – Environment management  

---

## 🛠️ Development Setup

```bash
# Install dependencies
npm install

# Start in development mode
npm start

# Build production installers
npm run build

# ⏱️ TimeIt – Developer-Friendly Time Tracker for VS Code

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=octech.timeit)
[![Build](https://github.com/OverlyCreativeTech/timeit/actions/workflows/ci.yml/badge.svg)](https://github.com/OverlyCreativeTech/timeit/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**TimeIt** helps developers log coding sessions automatically, add session comments, and export tracked time to **CSV**, **Jira**, or **Notion** — all within VS Code.

---

## ✨ Features

- **Automatic time tracking** when you start coding  
- **Idle detection & trimming** for accurate duration  
- **Session comments** on stop  
- **Multi-sink export** — CSV, Jira, Notion  
- **Guided credential prompts** (stored securely)  
- **Edit or clear credentials anytime**  
- **Sink selection each session**  
- **CSV menu** in the status bar for quick access  

---

## 🚀 Installation

1. Clone or download this repository:

   ```bash
   git clone https://github.com/OverlyCreativeTech/timeit.git
   cd timeit
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Launch in VS Code:

   ```bash
   code .
   ```

4. Press **F5** to start the extension in a new VS Code window.

---

## 🧩 Usage

### Start tracking

- Click the **⏱️ timer** in the status bar or run:

  ```
  TimeIt: Start Tracking
  ```

### Stop tracking

- Click the timer again or run:

  ```
  TimeIt: Stop Tracking
  ```

- Add a session comment when prompted.

### Choose export sinks

- On stop, you’ll be asked where to export the session (CSV, Jira, Notion).  
- Only configured sinks will be active.

### CSV quick actions

Click the **📂 CSV** icon next to the timer to:

- Change the CSV output folder  
- View past logs  
- Open logs in your editor  

---

## 🔐 Credential Management

### First-time setup

When a sink (like Jira) is selected, TimeIt prompts you for:

- Domain (e.g., `yourteam.atlassian.net`)
- Email
- API Token

Values are stored securely using:

- **VS Code Secret Storage** for sensitive keys  
- **Workspace Settings** for non-secret configuration

### Edit or clear credentials

| Command | Description |
|----------|-------------|
| `TimeIt: Edit Credentials` | Edit existing sink credentials. |
| `TimeIt: Clear Credentials` | Remove credentials for a specific sink or all. |

---

## 🧮 Configuration Options

| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `timeit.autoStartOnLaunch` | boolean | `true` | Start tracking automatically on launch. |
| `timeit.idleTimeoutMinutes` | number | `5` | Idle time threshold. |
| `timeit.showNotifications` | boolean | `true` | Show start/stop/export messages. |
| `timeit.askSinksEachTime` | boolean | `true` | Always prompt for sinks each session. |
| `timeit.enabledSinks` | string[] | `["csv"]` | Default sinks when prompting is off. |
| `timeit.csv.outputDirectory` | string | workspace root | CSV export folder. |
| `timeit.csv.filename` | string | `time_log.csv` | CSV log file name. |

---

## 🧭 Supported Export Sinks

| Sink | Description | Config Keys |
|------|--------------|-------------|
| **CSV** | Writes session logs to a CSV file. | `timeit.csv.outputDirectory`, `timeit.csv.filename` |
| **Jira** | Adds worklogs to Jira issues. | `timeit.jira.domain`, `timeit.jira.email`, `timeit.jira.apiToken` |
| **Notion** | (optional) Inserts session data into a Notion database. | `timeit.notion.databaseId`, `timeit.notion.token` |

---

## 🧪 Development

### Run locally

```bash
yarn install
yarn compile
code .
```

### Test

```bash
yarn test
```

### Build release

```bash
vsce package
```

---

## 📄 License

**MIT License**  
© 2025 Overly Creative Tech

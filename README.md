<div align="center">

<img src="docs/logo.png" alt="OpenAsst Logo" width="200"/>

# OpenAsst

### AI-Powered Terminal Assistant for Natural Language System Operations

[![Website](https://img.shields.io/badge/Website-OpenAsst.Ai-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://openasst.ai)
[![GitHub](https://img.shields.io/badge/GitHub-OpenAsst-black?style=for-the-badge&logo=github&logoColor=white)](https://github.com/abingyyds/OpenAsst)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[![Node.js](https://img.shields.io/badge/Node.js-16+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20|%20Linux%20|%20Windows-lightgrey?style=flat-square)]()

<br/>

**🌐 [Web Dashboard](https://openasst.ai)** &nbsp;•&nbsp; **📖 [Documentation](#quick-start)** &nbsp;•&nbsp; **💬 [Issues](https://github.com/abingyyds/OpenAsst/issues)**

<br/>

<img src="https://raw.githubusercontent.com/abingyyds/OpenAsst/main/docs/demo.gif" alt="OpenAsst Demo" width="700"/>

</div>

<br/>

## ✨ Overview

> **OpenAsst** is an intelligent terminal assistant that lets you manage servers and execute system tasks using **natural language**.

<table>
<tr>
<td width="50%">

### 🖥️ CLI Tool (Core)
A powerful command-line tool for AI-driven system operations
- Natural language task execution
- Multi-server cluster control
- API sharing with dev tools

</td>
<td width="50%">

### 🌐 Web Dashboard
Visual interface at **[OpenAsst.Ai](https://openasst.ai)**
- Server management GUI
- Batch AI execution
- Real-time terminal streaming

</td>
</tr>
</table>

---

## 🚀 Quick Start

### One-Line Installation

<table>
<tr>
<td><b>macOS / Linux</b></td>
<td>

```bash
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
```

</td>
</tr>
<tr>
<td><b>Windows (PowerShell)</b></td>
<td>

```powershell
iwr -useb https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.ps1 | iex
```

</td>
</tr>
</table>

### Configure & Use

```bash
# Configure your API key
openasst config

# Start using with natural language!
openasst do "install nginx and configure it for port 8080"
```

---

## 🎯 CLI Features

| Feature | Description |
|:--------|:------------|
| 🎛️ **Cluster Control** | Manage multiple servers simultaneously |
| 🤖 **Smart Task Engine** | Execute any task using natural language |
| 🔧 **Auto Error Recovery** | Intelligent error detection and auto-fixing |
| 🔒 **Security Guard** | Built-in protection against dangerous commands |
| 🔗 **API Sharing** | Share AI API with Claude Code, Cursor, Aider |
| 🧩 **Skill System** | Extensible skills for Git, Docker, System ops |
| ⏰ **Scheduled Tasks** | Create timers and automated jobs |
| 🚀 **Auto Deployment** | Deploy from Git repos or documentation |

---

## 💡 Smart Task Engine

Execute any task with natural language:

```bash
# Install software
openasst do "install docker and start it"

# System operations
openasst do "check disk usage and clean up if over 80%"

# Development tasks
openasst do "create a new React project with TypeScript"

# Auto-confirm mode
openasst do "update all npm packages" -y
```

---

## 📦 Deploy from Documentation

```bash
# From URL
openasst deploy https://example.com/install-guide.md

# From local file
openasst deploy ./INSTALL.md

# Auto deploy from Git
openasst auto https://github.com/user/repo.git
```

---

## 🔗 API Sharing

Share your AI API with other development tools:

```bash
openasst api share claude-code   # Claude Code
openasst api share cursor        # Cursor
openasst api share               # All tools
```

**Supported:** Claude Code, Cursor, Continue, Aider

---

## 🎛️ Cluster Control

Manage multiple servers from a single command line.

```
┌─────────────────────────────────────────────────┐
│              Master (Your Machine)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ CLI      │  │ WSHub    │  │ DeviceManager│  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ WebSocket
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
 ┌──────────┐  ┌──────────┐  ┌──────────┐
 │ Server A │  │ Server B │  │ Server C │
 └──────────┘  └──────────┘  └──────────┘
```

```bash
# Add devices
openasst devices add

# Execute on all servers
openasst run "uname -a" --all

# AI tasks on cluster
openasst do "install nginx" --all
```

---

## 🌐 Web Dashboard

> **Live Demo: [OpenAsst.Ai](https://openasst.ai)**

| Feature | Description |
|:--------|:------------|
| 🖥️ **Server Management** | Add and manage multiple SSH servers |
| 🎛️ **Batch Control** | Execute AI tasks on multiple servers |
| 🤖 **Terminal Agent** | Deploy CLI agent on remote servers |
| 📜 **Script Marketplace** | Share and use command templates |
| ⚡ **Real-time Streaming** | Live command output in browser |

---

### Self-Hosted Setup

```bash
# Clone & Install
git clone https://github.com/abingyyds/OpenAsst.git
cd OpenAsst && npm install
cd frontend && npm install && cd ..

# Configure .env files
cp .env.example .env

# Run
npm run dev          # Backend
cd frontend && npm run dev  # Frontend
```

---

## ⚙️ Configuration

**CLI:** `~/.openasst-cli/config.json`
```json
{
  "apiKey": "your-anthropic-api-key",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-sonnet-4-20250514"
}
```

---

## 📁 Project Structure

```
OpenAsst/
├── cli/                # CLI Tool (Core)
├── src/                # Web Backend
├── frontend/           # Web Dashboard (Next.js)
├── local-agent/        # Local Agent
└── install.sh          # Installer
```

---

## 🔒 Security

- Blocks dangerous commands (`rm -rf /`, `mkfs`, etc.)
- Warns about sudo operations
- Requires confirmation for destructive actions

---

## 🤝 Contributing

Contributions welcome! Please submit issues and pull requests.

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

<div align="center">

**[🌐 OpenAsst.Ai](https://openasst.ai)** &nbsp;•&nbsp; **[⭐ Star on GitHub](https://github.com/abingyyds/OpenAsst)**

Made with ❤️ by OpenAsst Team

</div>

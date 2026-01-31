# OpenAsst

<p align="center">
  <b>AI-Powered Terminal Assistant for Natural Language System Operations</b>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#cli-features">CLI Features</a> •
  <a href="#web-dashboard">Web Dashboard</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-sharing">API Sharing</a>
</p>

---

## Overview

OpenAsst is an intelligent terminal assistant that lets you manage servers and execute system tasks using natural language. The project consists of two parts:

- **CLI Tool** (Core) - A powerful command-line tool for AI-driven system operations
- **Web Dashboard** (Optional) - A visual interface for users who prefer GUI

---

## Quick Start

### CLI Installation (Recommended)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
iwr -useb https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.ps1 | iex
```

**Windows (CMD):**

```cmd
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.bat -o install.bat && install.bat
```

**Configure:**

```bash
openasst config
```

**Start using:**

```bash
openasst do "install nginx and configure it for port 8080"
```

---

## CLI Features

| Feature | Description |
|---------|-------------|
| 🤖 **Smart Task Engine** | Execute any task using natural language |
| 🔧 **Auto Error Recovery** | Intelligent error detection and auto-fixing |
| 🔒 **Security Guard** | Built-in protection against dangerous commands |
| 🔗 **API Sharing** | Share AI API with Claude Code, Cursor, Aider |
| 🧩 **Skill System** | Extensible skills for Git, Docker, System ops |
| ⏰ **Scheduled Tasks** | Create timers and automated jobs |
| 🚀 **Auto Deployment** | Deploy from Git repos or documentation |
| 📊 **Service Management** | Manage background services |
| 👁️ **Monitoring** | Monitor services with auto-restart |
| 🌍 **Cross-platform** | macOS, Linux, Windows |

### Smart Task Engine

The core of OpenAsst - execute any task with natural language:

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

### Deploy from Documentation

```bash
# From URL
openasst deploy https://example.com/install-guide.md

# From local file
openasst deploy ./INSTALL.md

# Auto deploy from Git
openasst auto https://github.com/user/repo.git
```

### API Sharing

Share your AI API with other development tools:

```bash
# Share with Claude Code
openasst api share claude-code

# Share with Cursor
openasst api share cursor

# Share with all supported tools
openasst api share
```

**Supported Tools:** Claude Code, Cursor, Continue, Aider

### Interactive Assistant

```bash
openasst assistant
```

### All CLI Commands

| Command | Description |
|---------|-------------|
| `openasst do <task>` | Execute task with natural language |
| `openasst assistant` | Interactive assistant mode |
| `openasst config` | Configure API settings |
| `openasst deploy <source>` | Deploy from documentation |
| `openasst auto <source>` | Auto deploy from Git |
| `openasst api share` | Share API with other tools |
| `openasst skill list` | List installed skills |
| `openasst schedule list` | List scheduled tasks |
| `openasst service list` | List background services |
| `openasst monitor start` | Start monitoring |

---

## Web Dashboard

The Web Dashboard provides a visual interface for managing remote servers. It's optional but useful for users who prefer GUI over terminal.

### Features

- 🖥️ **Server Management** - Add and manage multiple servers (SSH)
- 📜 **Script Marketplace** - Share and use command templates
- 🤖 **AI Assistant** - Chat with AI for server management help
- ⚡ **Real-time Execution** - Stream command output in browser
- 🔄 **One-click CLI Install** - Install CLI on servers via AI

### Web Dashboard Setup

**Prerequisites:**
- Node.js 18+
- Anthropic API Key
- Supabase Project (for authentication)

**Install & Run:**

```bash
# Clone repository
git clone https://github.com/abingyyds/OpenAsst.git
cd OpenAsst

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Configure environment variables
cp .env.example .env
# Edit .env with your API keys

# Start backend (Terminal 1)
npm run dev

# Start frontend (Terminal 2)
cd frontend && npm run dev
```

**Access:** Open `http://localhost:3000` in your browser

---

## Configuration

### CLI Configuration

```bash
openasst config
```

Or manually create `~/.openasst-cli/config.json`:

```json
{
  "apiKey": "your-anthropic-api-key",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-sonnet-4-20250514"
}
```

### Web Dashboard Configuration

**Backend (.env):**
```bash
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_BASE_URL=https://api.anthropic.com
PORT=3002
```

**Frontend (frontend/.env.local):**
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
NEXT_PUBLIC_API_URL=http://localhost:3002
```

---

## Project Structure

```
OpenAsst/
├── cli/                    # CLI Tool (Core)
│   ├── src/
│   │   ├── core/
│   │   │   ├── smart-task-engine.ts   # AI task execution
│   │   │   ├── security-guard.ts      # Command safety check
│   │   │   ├── error-handler.ts       # Auto error recovery
│   │   │   └── ...
│   │   ├── commands/       # CLI commands
│   │   └── utils/          # Utilities
│   └── package.json
│
├── src/                    # Web Backend
│   ├── server.ts           # Express server
│   ├── ssh-manager.ts      # SSH connections
│   └── ...
│
├── frontend/               # Web Dashboard
│   ├── app/                # Next.js pages
│   ├── lib/                # API clients
│   └── ...
│
└── install.sh              # macOS/Linux installer
├── install.ps1             # Windows PowerShell installer
└── install.bat             # Windows CMD installer
```

---

## Security

OpenAsst includes built-in security protection:

- Blocks dangerous commands (`rm -rf /`, `mkfs`, etc.)
- Warns about sudo operations
- Requires confirmation for destructive actions
- Sandboxed command execution

---

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by OpenAsst Team
</p>

# OpenAsst

<p align="center">
  <b>AI-powered terminal assistant for natural language system operations</b>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-sharing">API Sharing</a> •
  <a href="#skills">Skills</a>
</p>

---

## Quick Start

**One-liner install:**

```bash
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
```

**Then configure:**

```bash
openasst config
```

**Start using:**

```bash
openasst do "install docker and start it"
```

---

## Features

| Feature | Description |
|---------|-------------|
| 🤖 **Smart Task Engine** | Execute any task using natural language |
| 🔧 **Auto Error Recovery** | Intelligent error detection and auto-fixing |
| 🔒 **Security Guard** | Built-in protection against dangerous commands |
| 🔗 **API Sharing** | Share AI API with Claude Code, Cursor, Aider, etc. |
| 🧩 **Skill System** | Extensible skills for Git, Docker, System ops |
| ⏰ **Scheduled Tasks** | Create timers and automated jobs |
| 🚀 **Auto Deployment** | Deploy from Git repos or documentation |
| 📊 **Service Management** | Manage background services |
| 👁️ **Monitoring** | Monitor services with auto-restart |
| 🌍 **Cross-platform** | macOS, Linux, Windows |

---

## Installation

### One-liner (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
```

### Manual Installation

```bash
git clone https://github.com/abingyyds/OpenAsst.git
cd OpenAsst/cli
npm install
npm run build
npm link
```

---

## Configuration

```bash
openasst config
```

Or manually:

```bash
mkdir -p ~/.openasst-cli
cat > ~/.openasst-cli/config.json << EOF
{
  "apiKey": "your-anthropic-api-key",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-3-5-sonnet-20241022"
}
EOF
```

---

## Usage

### Smart Task Engine

Execute any task using natural language:

```bash
# Install software
openasst do "install nginx and configure it for port 8080"

# System operations
openasst do "check disk usage and clean up if over 80%"

# Development tasks
openasst do "create a new React project with TypeScript"

# Auto-confirm mode
openasst do "update all npm packages" -y

# Verbose output
openasst do "deploy my app to production" -v
```

### Interactive Assistant

```bash
openasst assistant
```

### Deploy from Documentation

```bash
# From URL
openasst deploy https://example.com/install-guide.md

# From local file
openasst deploy ./INSTALL.md

# With options
openasst deploy https://docs.example.com/setup --dry-run
```

### Auto Deploy from Git

```bash
openasst auto https://github.com/user/repo.git
openasst auto https://github.com/user/repo.git -b develop
```

---

## API Sharing

Share your AI API with other tools:

```bash
# List supported tools
openasst api tools

# Share with Claude Code
openasst api share claude-code

# Share with Cursor
openasst api share cursor

# Share with all tools
openasst api share

# Export as environment variables
openasst api export
```

**Supported Tools:**
- Claude Code
- Cursor
- Continue
- Aider
- Shell environment variables

---

## Skills

Extensible skill system for specialized operations:

```bash
# List installed skills
openasst skill list

# Install built-in skills
openasst skill init

# Run a skill command
openasst skill run git-ops status
openasst skill run docker-ops ps
openasst skill run system-ops info

# Remove a skill
openasst skill remove <skill-id>
```

**Built-in Skills:**
- `git-ops` - Git operations (status, commit, push, pull)
- `docker-ops` - Docker management (ps, up, down, logs)
- `system-ops` - System utilities (info, disk, memory, processes)

---

## Scheduled Tasks

Create automated jobs with cron scheduling:

```bash
# List scheduled tasks
openasst schedule list

# Add a new task
openasst schedule add

# Remove a task
openasst schedule remove <task-id>

# Enable/disable a task
openasst schedule toggle <task-id> --enable
openasst schedule toggle <task-id> --disable
```

---

## Service Management

Manage background services:

```bash
# Start a service
openasst service start myapp "npm start" -d /path/to/app

# Stop a service
openasst service stop myapp

# Restart a service
openasst service restart myapp

# List all services
openasst service list

# View logs
openasst service logs myapp -n 100
```

---

## Monitoring

Monitor services with auto-restart:

```bash
# Start monitoring
openasst monitor start

# Create new monitor config
openasst monitor start --new

# Check status
openasst monitor status
```

---

## Security

OpenAsst includes built-in security protection:

- Blocks dangerous commands (`rm -rf /`, `mkfs`, etc.)
- Warns about sudo operations
- Requires confirmation for destructive actions
- Sandboxed command execution

---

## All Commands

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
| `openasst analyze` | Analyze project structure |
| `openasst market list` | Browse script marketplace |

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by OpenAsst Team
</p>


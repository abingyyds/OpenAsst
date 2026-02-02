# OpenAsst CLI

<p align="center">
  <b>AI-powered terminal assistant with cluster control capabilities</b>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#cluster-control">Cluster Control</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-sharing">API Sharing</a>
</p>

---

## Quick Start

**One-liner install:**

```bash
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
```

**Configure API:**

```bash
openasst config
```

**Start using:**

```bash
# Single machine - natural language task execution
openasst do "install docker and start it"

# Cluster control - execute on multiple servers
openasst run "uname -a" --all
```

---

## Features

| Feature | Description |
|---------|-------------|
| 🎛️ **Cluster Control** | Manage and execute commands on multiple servers simultaneously |
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
# Clone repository
git clone https://github.com/abingyyds/OpenAsst.git
cd OpenAsst/cli

# Install dependencies
npm install

# Build
npm run build

# Link globally
npm link
```

### Requirements

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **SSH client** (for cluster control)
- **sshpass** (optional, for password authentication)

```bash
# Install sshpass on macOS
brew install hudochenkov/sshpass/sshpass

# Install sshpass on Ubuntu/Debian
apt-get install sshpass

# Install sshpass on CentOS/RHEL
yum install sshpass
```

---

## Configuration

```bash
openasst config
```

Or manually create config file:

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

### Supported Models

| Provider | Models |
|----------|--------|
| Anthropic | claude-3-5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku |
| OpenAI | gpt-4, gpt-4-turbo, gpt-3.5-turbo |
| DeepSeek | deepseek-chat, deepseek-coder |

---

## Cluster Control

OpenAsst's core feature is **cluster control** - manage multiple servers from a single command line.

### Architecture

```
┌─────────────────────────────────────────────────┐
│              Master (Your Machine)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ CLI      │  │ WSHub    │  │ DeviceManager│  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ WebSocket (Port 9527)
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
 ┌──────────┐  ┌──────────┐  ┌──────────┐
 │ Agent 1  │  │ Agent 2  │  │ Agent N  │
 │ Server A │  │ Server B │  │ Server C │
 └──────────┘  └──────────┘  └──────────┘
```

### Quick Start - Cluster Control

```bash
# 1. Add devices
openasst devices add

# 2. Start the hub
openasst hub start

# 3. Deploy agents to servers
openasst agent deploy --all

# 4. Execute commands on all servers
openasst run "uname -a" --all
```

### Device Management

```bash
# List all devices
openasst devices list

# Add a new device (interactive)
openasst devices add

# Remove a device
openasst devices remove <name>

# Test SSH connection
openasst devices test <name>

# Import devices from JSON
openasst devices import devices.json

# Export devices to JSON
openasst devices export backup.json
```

### Group Management

```bash
# List all groups
openasst groups list

# Create a new group
openasst groups add

# Remove a group
openasst groups remove <name>
```

### Hub Management

```bash
# Start WebSocket hub
openasst hub start

# Check hub status
openasst hub status

# Stop hub
openasst hub stop
```

### Batch Execution

```bash
# Execute on all devices
openasst run "command" --all

# Execute on devices with specific tags
openasst run "command" --tags web,production

# Execute on specific devices
openasst run "command" --devices server1,server2

# Execute on a group
openasst run "command" --group frontend

# With timeout (milliseconds)
openasst run "command" --all --timeout 120000
```

### Agent Deployment

```bash
# Deploy agent to all devices
openasst agent deploy --all

# Deploy to specific devices
openasst agent deploy --devices server1,server2

# Check agent status
openasst agent status
```

### Device Configuration File

Devices are stored in `~/.openasst-cli/devices.json`:

```json
{
  "masterPort": 9527,
  "secretKey": "auto-generated-key",
  "devices": [
    {
      "id": "abc123",
      "name": "web-server-1",
      "host": "192.168.1.10",
      "port": 22,
      "username": "root",
      "authType": "privateKey",
      "privateKeyPath": "~/.ssh/id_rsa",
      "tags": ["web", "production"],
      "group": "frontend"
    }
  ],
  "groups": [
    {
      "name": "frontend",
      "description": "Frontend servers",
      "devices": ["abc123"]
    }
  ]
}
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

### Natural Language Cluster Control

Execute tasks on multiple servers using natural language with the `do` command:

```bash
# Install nginx on all servers
openasst do "install nginx" --all

# Update packages on servers with specific tags
openasst do "update all system packages" --tags web,production

# Configure firewall on specific devices
openasst do "open port 80 and 443 in firewall" --devices server1,server2

# Deploy application to a group
openasst do "pull latest code and restart service" --group frontend

# With auto-confirm
openasst do "install docker and start it" --all -y
```

The AI analyzes your natural language request, generates appropriate commands, and executes them on all target devices simultaneously.

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

### Share with Local Tools

Share your AI API with other tools on the same machine:

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
- Claude Code (`~/.claude/settings.json`)
- Cursor (`~/.cursor/settings.json`)
- Continue (`~/.continue/config.json`)
- Aider (`~/.aider.conf.yml`)
- Shell environment variables

### Sync to Remote Devices

Sync API configuration to remote servers:

```bash
# Sync to all devices
openasst api sync --all

# Sync to specific devices
openasst api sync --devices server1,server2
```

This allows remote OpenAsst instances to use the same AI API.

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

### Core Commands

| Command | Description |
|---------|-------------|
| `openasst config` | Configure API settings |
| `openasst do <task>` | Execute task with natural language |
| `openasst assistant` | Interactive assistant mode |

### Cluster Control

| Command | Description |
|---------|-------------|
| `openasst devices list` | List all devices |
| `openasst devices add` | Add a new device |
| `openasst devices remove <name>` | Remove a device |
| `openasst devices test <name>` | Test SSH connection |
| `openasst groups list` | List all groups |
| `openasst groups add` | Create a new group |
| `openasst hub start` | Start WebSocket hub |
| `openasst hub status` | Show hub status |
| `openasst run <cmd> --all` | Execute on all devices |
| `openasst run <cmd> --tags <t>` | Execute by tags |
| `openasst run <cmd> --group <g>` | Execute by group |
| `openasst do <task> --all` | AI cluster control on all devices |
| `openasst do <task> --tags <t>` | AI cluster control by tags |
| `openasst do <task> --group <g>` | AI cluster control by group |
| `openasst agent deploy --all` | Deploy agent to devices |
| `openasst agent status` | Show agent status |

### Deployment

| Command | Description |
|---------|-------------|
| `openasst deploy <source>` | Deploy from documentation |
| `openasst auto <source>` | Auto deploy from Git |
| `openasst analyze` | Analyze project structure |

### API & Skills

| Command | Description |
|---------|-------------|
| `openasst api share` | Share API with other tools |
| `openasst api sync --all` | Sync API to remote devices |
| `openasst api tools` | List supported tools |
| `openasst skill list` | List installed skills |
| `openasst skill init` | Install built-in skills |

### Services & Monitoring

| Command | Description |
|---------|-------------|
| `openasst service list` | List background services |
| `openasst service start` | Start a service |
| `openasst schedule list` | List scheduled tasks |
| `openasst monitor start` | Start monitoring |
| `openasst market list` | Browse script marketplace |

---

## Troubleshooting

### Installation Issues

#### `openasst: command not found`

```bash
# Check if npm link was successful
npm list -g openasst

# Re-link the command
cd OpenAsst/cli
npm link

# Or add to PATH manually
export PATH="$PATH:$(npm root -g)/../bin"
```

#### `npm install` fails with permission error

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use nvm to manage Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

#### `Error: Cannot find module 'xxx'`

```bash
# Clean install
cd OpenAsst/cli
rm -rf node_modules package-lock.json
npm install
npm run build
```

### API Configuration Issues

#### `API Key not configured`

```bash
# Run config command
openasst config

# Or manually create config
mkdir -p ~/.openasst-cli
echo '{"apiKey":"your-key"}' > ~/.openasst-cli/config.json
```

#### `401 Unauthorized` or `Invalid API Key`

```bash
# Check your API key
cat ~/.openasst-cli/config.json

# Verify key format (should start with sk-)
# Re-configure with correct key
openasst config
```

#### `Connection refused` or `Network error`

```bash
# Check if using proxy
echo $HTTP_PROXY $HTTPS_PROXY

# Try with custom base URL
openasst config
# Enter custom base URL when prompted
```

### SSH Connection Issues

#### `Permission denied (publickey)`

```bash
# Check SSH key permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub

# Test SSH manually
ssh -i ~/.ssh/id_rsa user@host

# Add key to ssh-agent
eval $(ssh-agent)
ssh-add ~/.ssh/id_rsa
```

#### `Connection timed out`

```bash
# Check if host is reachable
ping <host>

# Check if SSH port is open
nc -zv <host> 22

# Try with verbose mode
ssh -v user@host
```

#### `sshpass: command not found`

```bash
# macOS
brew install hudochenkov/sshpass/sshpass

# Ubuntu/Debian
sudo apt-get install sshpass

# CentOS/RHEL
sudo yum install sshpass
```

### Cluster Control Issues

#### `No online agents`

```bash
# 1. Check if hub is running
openasst hub status

# 2. Start hub if not running
openasst hub start

# 3. Check agent on remote server
ssh user@remote "systemctl status openasst-agent"

# 4. Check agent logs
ssh user@remote "journalctl -u openasst-agent -n 50"
```

#### Agent cannot connect to Master

```bash
# Check firewall on master
sudo ufw allow 9527/tcp  # Ubuntu
sudo firewall-cmd --add-port=9527/tcp --permanent  # CentOS

# Check if port is listening
netstat -tlnp | grep 9527

# Verify master IP in agent config
ssh user@remote "cat /etc/openasst/agent.json"
```

#### Agent deploy fails

```bash
# Check Node.js on remote
ssh user@remote "node --version"

# Install Node.js manually if needed
ssh user@remote "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
ssh user@remote "sudo apt-get install -y nodejs"

# Check systemd service
ssh user@remote "cat /etc/systemd/system/openasst-agent.service"
```

#### `run` command shows no results

```bash
# Check target devices are online
openasst agent status

# Increase timeout
openasst run "command" --all --timeout 120000

# Check hub logs
# Hub outputs connection info to terminal
```

### Common Errors

#### `ECONNREFUSED` error

```bash
# Service not running, start it
openasst hub start

# Or check if port is in use
lsof -i :9527
kill -9 <PID>  # Kill conflicting process
```

#### `ETIMEDOUT` error

```bash
# Network issue, check connectivity
ping <remote-host>

# Increase timeout
openasst run "cmd" --all --timeout 300000
```

#### `Authentication failed`

```bash
# Check secret key matches
cat ~/.openasst-cli/devices.json | grep secretKey

# Regenerate secret key
# Edit devices.json and update secretKey
# Then redeploy agents
openasst agent deploy --all
```

### Logs and Debugging

#### View CLI logs

```bash
# Enable verbose mode
openasst do "task" -v

# Check config file
cat ~/.openasst-cli/config.json

# Check devices file
cat ~/.openasst-cli/devices.json
```

#### View Agent logs (on remote server)

```bash
# Systemd logs
journalctl -u openasst-agent -f

# Check agent config
cat /etc/openasst/agent.json

# Restart agent
systemctl restart openasst-agent
```

#### Reset everything

```bash
# Reset CLI config
rm -rf ~/.openasst-cli
openasst config

# Reset agent (on remote)
ssh user@remote "systemctl stop openasst-agent"
ssh user@remote "rm -rf /opt/openasst-agent /etc/openasst"
```

---

## FAQ

**Q: Which operating systems are supported?**

A: Master supports macOS, Linux, and Windows. Agent supports all Linux distributions.

**Q: How many servers can be managed?**

A: Theoretically unlimited. The actual limit depends on the Master machine's performance and network bandwidth.

**Q: How much resources does the Agent consume?**

A: Agent is very lightweight, using about 20-50MB of memory and almost no CPU.

**Q: How to update the Agent?**

A: Run `openasst agent deploy --all` to automatically overwrite and update.

**Q: What to do if the secret key is leaked?**

A: Delete the `secretKey` in `~/.openasst-cli/devices.json`, run any command to auto-generate a new key, then redeploy the Agent.

**Q: Can I use OpenAI's API?**

A: Yes, set a custom baseUrl to OpenAI's address when running `openasst config`.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by OpenAsst Team
</p>


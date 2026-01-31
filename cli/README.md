# OpenAsst CLI

OpenAsst CLI is an AI-powered terminal assistant that helps you accomplish system tasks using natural language.

## Features

- **Smart Task Engine** - Execute any task using natural language, AI automatically plans and executes commands
- **Auto Error Recovery** - Intelligent error detection and automatic fixing
- **Security Guard** - Built-in security checks to prevent dangerous operations
- **Project Deployment** - Auto-deploy from documentation URLs or Git repositories
- **Service Management** - Manage background services with ease
- **Project Monitoring** - Monitor services with auto-restart capability
- **Script Marketplace** - Pre-defined command scripts library
- **Cross-platform** - Supports Windows, macOS, and Linux

## Installation

```bash
cd cli
npm install
npm run build
npm link
```

## Configuration

Configure your API key before first use:

```bash
openasst config
```

Or manually create the config file:

```bash
mkdir -p ~/.openasst-cli
cat > ~/.openasst-cli/config.json << EOF
{
  "apiKey": "your-api-key",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-3-5-sonnet-20241022"
}
EOF
```

## Usage

### Smart Task Engine (Recommended)

Execute any task using natural language:

```bash
# Basic usage
openasst do "show system information"
openasst do "find files larger than 100MB"
openasst do "install nginx and start it"

# Auto-confirm all actions
openasst do "update all packages" -y

# Specify working directory
openasst do "build the project" -d /path/to/project
```

### Interactive Assistant

Enter interactive mode for continuous task execution:

```bash
openasst assistant
```

### AI Task Execution

Legacy AI command for task execution:

```bash
openasst ai "check disk usage and clean up old logs"
```

### Project Analysis

Analyze project structure and detect type:

```bash
openasst analyze .
openasst analyze /path/to/project
```

### Auto Deployment

Deploy projects automatically from Git or local directory:

```bash
# From Git repository
openasst auto https://github.com/user/repo.git

# From local directory
openasst auto . -d /var/www/myapp

# Specify branch
openasst auto https://github.com/user/repo.git -b develop
```

### Deploy from Documentation

Deploy following instructions from a documentation URL:

```bash
# From URL
openasst deploy https://example.com/install-guide.md

# From local file
openasst deploy ./INSTALL.md

# Dry run (preview only)
openasst deploy https://example.com/guide.md --dry-run
```

### Quick Deploy with Templates

Use pre-defined deployment templates:

```bash
# List available templates
openasst templates

# Deploy using template
openasst quick nodejs
openasst quick docker
openasst quick nginx
```

### Service Management

Manage background services:

```bash
# Start a service
openasst service start myapp "node server.js"
openasst service start myapp "python app.py" -d /path/to/app

# Stop a service
openasst service stop myapp

# Restart a service
openasst service restart myapp

# List all services
openasst service list

# View service logs
openasst service logs myapp
openasst service logs myapp -n 100
```

### Project Monitoring

Monitor services with auto-restart:

```bash
# Start monitoring
openasst monitor start

# Create new monitor config
openasst monitor start --new

# View monitor status
openasst monitor status
```

### Script Marketplace

Browse and run pre-defined scripts:

```bash
# List all scripts
openasst market list

# Search scripts
openasst market search disk

# Run a script
openasst market run sys-info
openasst market run disk-usage
openasst market run network-info
```

### Interactive Chat Mode

Real-time deployment and configuration:

```bash
openasst chat
openasst chat -d /path/to/project
```

## Available Templates

| Template | Description |
|----------|-------------|
| `nodejs` | Node.js project deployment |
| `python` | Python project (Flask/Django/FastAPI) |
| `docker` | Docker container deployment |
| `nginx` | Nginx reverse proxy configuration |
| `mysql` | MySQL database installation |
| `redis` | Redis cache service |
| `nextjs` | Next.js application deployment |

## Built-in Scripts

| Script | Description |
|--------|-------------|
| `sys-info` | Display system information |
| `disk-usage` | Show disk space usage |
| `network-info` | Display network configuration |

## Security Features

OpenAsst CLI includes built-in security protections:

- **Dangerous Command Detection** - Blocks potentially harmful commands (rm -rf /, fork bombs, etc.)
- **Sensitive Path Protection** - Warns when accessing system files
- **Confirmation Prompts** - Requires confirmation for critical operations
- **Input Sanitization** - Sanitizes user input to prevent injection

## Architecture

```
src/
├── commands/          # CLI command handlers
│   ├── ai.ts         # AI task execution
│   ├── do.ts         # Smart task engine command
│   ├── deploy.ts     # Deployment commands
│   ├── service.ts    # Service management
│   └── ...
├── core/             # Core modules
│   ├── smart-task-engine.ts  # Intelligent task execution
│   ├── ai-assistant.ts       # AI integration
│   ├── error-handler.ts      # Error detection & fixing
│   ├── security-guard.ts     # Security checks
│   ├── system-operations.ts  # System utilities
│   └── ...
├── utils/            # Utility functions
└── types.ts          # TypeScript definitions
```

## Development

```bash
# Development mode
npm run dev

# Build
npm run build

# Run
npm start
```

## Safety Notice

⚠️ **Important Security Tips**

- Commands are previewed before execution and require confirmation
- Carefully review AI-generated commands before confirming
- Avoid executing commands you don't understand
- Test in a safe environment first
- The `-y` flag skips confirmations - use with caution

## License

MIT

---

## New Features

### API Sharing

Share your AI API with other tools:

```bash
# List available tools
openasst api tools

# Share API with a specific tool
openasst api share claude-code
openasst api share cursor
openasst api share aider

# Export as environment variables
openasst api export
```

### Skill System

Install and manage skills to extend functionality:

```bash
# Install built-in skills
openasst skill init

# List installed skills
openasst skill list

# Run a skill command
openasst skill run git-ops status
openasst skill run docker-ops ps
openasst skill run system-ops disk

# Remove a skill
openasst skill remove <skill-id>
```

**Built-in Skills:**

| Skill | Commands |
|-------|----------|
| `git-ops` | status, pull, push, commit |
| `docker-ops` | ps, images, stop-all, prune |
| `system-ops` | update, clean, disk, memory |

### Scheduled Tasks

Create and manage scheduled tasks:

```bash
# List scheduled tasks
openasst schedule list

# Add a new scheduled task (interactive)
openasst schedule add

# Remove a task
openasst schedule remove <task-id>

# Enable/disable a task
openasst schedule toggle <task-id> --enable
openasst schedule toggle <task-id> --disable
```

'use client'

import { useState } from 'react'
import Link from 'next/link'

type Category = 'getting-started' | 'task' | 'deploy' | 'api' | 'service' | 'config'

interface Command {
  cmd: string
  desc: string
  example?: string
  output?: string
}

const categories: Record<Category, { title: string; icon: string; commands: Command[] }> = {
  'getting-started': {
    title: 'Getting Started',
    icon: '>',
    commands: [
      {
        cmd: 'openasst config',
        desc: 'Configure API key and settings interactively',
        example: 'openasst config',
        output: '? Enter your Anthropic API key: sk-ant-***\n? Select model: claude-sonnet-4-20250514\n✓ Configuration saved!'
      },
      {
        cmd: 'openasst --version',
        desc: 'Display CLI version information',
      },
      {
        cmd: 'openasst --help',
        desc: 'Show all available commands and options',
      },
    ]
  },
  'task': {
    title: 'Smart Task Engine',
    icon: '*',
    commands: [
      {
        cmd: 'openasst do "<task>"',
        desc: 'Execute any task using natural language',
        example: 'openasst do "install nginx and configure it for port 8080"',
        output: '> Analyzing task...\n> Installing nginx...\n> Configuring port 8080...\n✓ Task completed successfully!'
      },
      {
        cmd: 'openasst do "<task>" -y',
        desc: 'Execute task with auto-confirm (skip confirmations)',
        example: 'openasst do "update all npm packages" -y',
      },
      {
        cmd: 'openasst assistant',
        desc: 'Start interactive assistant mode for continuous conversation',
        example: 'openasst assistant',
        output: 'OpenAsst Assistant v1.0.0\nType your request or "exit" to quit.\n\nYou: '
      },
    ]
  },
  'deploy': {
    title: 'Auto Deployment',
    icon: '#',
    commands: [
      {
        cmd: 'openasst deploy <source>',
        desc: 'Deploy from documentation (URL or local file)',
        example: 'openasst deploy https://example.com/install-guide.md',
        output: '> Fetching documentation...\n> Parsing install steps...\n> Executing step 1/3: npm install\n> Executing step 2/3: npm run build\n> Executing step 3/3: pm2 start\n✓ Deployment complete!'
      },
      {
        cmd: 'openasst deploy ./INSTALL.md',
        desc: 'Deploy from local markdown file',
      },
      {
        cmd: 'openasst auto <git-url>',
        desc: 'Auto deploy from Git repository',
        example: 'openasst auto https://github.com/user/repo.git',
        output: '> Cloning repository...\n> Detecting project type: Node.js\n> Reading README.md for instructions...\n> Running npm install && npm run build\n✓ Auto deployment complete!'
      },
    ]
  },
  'api': {
    title: 'API Sharing',
    icon: '$',
    commands: [
      {
        cmd: 'openasst api share',
        desc: 'Share AI API with all supported development tools',
        example: 'openasst api share',
        output: '✓ API shared with:\n  - Claude Code\n  - Cursor\n  - Continue\n  - Aider'
      },
      {
        cmd: 'openasst api share <tool>',
        desc: 'Share API with a specific tool',
        example: 'openasst api share claude-code',
        output: '✓ API configured for Claude Code\n  Config path: ~/.claude/config.json'
      },
      {
        cmd: 'openasst skill list',
        desc: 'List all installed skills',
        example: 'openasst skill list',
        output: 'Installed Skills:\n  git      - Git operations\n  docker   - Docker management\n  system   - System utilities'
      },
    ]
  },
  'service': {
    title: 'Service & Monitoring',
    icon: '@',
    commands: [
      {
        cmd: 'openasst service list',
        desc: 'List all background services',
        example: 'openasst service list',
        output: 'NAME          STATUS    PID     UPTIME\n────────────────────────────────────\napi-server    running   1234    2d 5h\nworker        running   1235    2d 5h\nscheduler     stopped   -       -'
      },
      {
        cmd: 'openasst schedule list',
        desc: 'List all scheduled tasks',
        example: 'openasst schedule list',
        output: 'ID    SCHEDULE       TASK\n─────────────────────────────────\n1     0 2 * * *      backup database\n2     */5 * * * *    health check'
      },
      {
        cmd: 'openasst monitor start',
        desc: 'Start monitoring services with auto-restart',
        example: 'openasst monitor start',
        output: '✓ Monitoring started\n  Watching: api-server, worker\n  Auto-restart: enabled'
      },
    ]
  },
  'config': {
    title: 'Configuration',
    icon: '%',
    commands: [
      {
        cmd: 'openasst config',
        desc: 'Interactive configuration wizard',
      },
      {
        cmd: 'openasst config set <key> <value>',
        desc: 'Set a configuration value',
        example: 'openasst config set model claude-sonnet-4-20250514',
      },
      {
        cmd: 'openasst config get <key>',
        desc: 'Get a configuration value',
        example: 'openasst config get apiKey',
        output: 'sk-ant-***'
      },
      {
        cmd: 'openasst config list',
        desc: 'List all configuration settings',
        example: 'openasst config list',
        output: 'apiKey: sk-ant-***\nbaseUrl: https://api.anthropic.com\nmodel: claude-sonnet-4-20250514'
      },
    ]
  },
}

export default function DocsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('getting-started')

  return (
    <div className="min-h-screen bg-[#0a0f0d] grid-pattern">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-green-500 hover:text-green-400 font-mono text-sm mb-2 inline-block">
              &lt;- back to home
            </Link>
            <h1 className="text-4xl font-bold text-white font-mono"># CLI Documentation</h1>
            <p className="text-gray-500 font-mono mt-2">Complete guide to OpenAsst CLI commands</p>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 shrink-0">
            <nav className="terminal-card p-4 sticky top-8">
              <p className="text-green-500/70 text-xs font-mono mb-3 uppercase">Categories</p>
              {(Object.keys(categories) as Category[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded font-mono text-sm mb-1 transition ${
                    activeCategory === cat
                      ? 'bg-green-900/30 text-green-400 border-l-2 border-green-500'
                      : 'text-gray-400 hover:text-green-400 hover:bg-green-900/10'
                  }`}
                >
                  <span className="text-green-600 mr-2">{categories[cat].icon}</span>
                  {categories[cat].title}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="terminal-card">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-green-500/70 text-sm font-mono">
                  {categories[activeCategory].title.toLowerCase().replace(' ', '-')} ~ docs
                </span>
              </div>

              {/* Commands List */}
              <div className="p-6 space-y-6">
                <h2 className="text-xl font-bold text-green-400 font-mono flex items-center gap-2">
                  <span className="text-2xl">{categories[activeCategory].icon}</span>
                  {categories[activeCategory].title}
                </h2>

                {categories[activeCategory].commands.map((command, idx) => (
                  <CommandBlock key={idx} command={command} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CommandBlock({ command }: { command: Command }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(command.cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-green-900/30 rounded-lg overflow-hidden">
      {/* Command Header */}
      <div className="bg-green-900/10 px-4 py-3 flex items-center justify-between">
        <code className="text-green-400 font-mono">{command.cmd}</code>
        <button
          onClick={handleCopy}
          className="px-2 py-1 text-xs border border-green-900/50 text-green-500 rounded hover:bg-green-900/20 font-mono transition"
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-3 border-t border-green-900/20">
        <p className="text-gray-400 text-sm">{command.desc}</p>
      </div>

      {/* Example */}
      {command.example && (
        <div className="px-4 py-3 border-t border-green-900/20 bg-[#0a0f0d]">
          <p className="text-green-500/70 text-xs font-mono mb-2">Example:</p>
          <div className="font-mono text-sm">
            <div className="text-green-400">
              <span className="text-green-600">$</span> {command.example}
            </div>
            {command.output && (
              <pre className="text-gray-500 mt-2 whitespace-pre-wrap">{command.output}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

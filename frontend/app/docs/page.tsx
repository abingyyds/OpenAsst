'use client'

import { useState } from 'react'
import Link from 'next/link'

type Category = 'getting-started' | 'server' | 'script' | 'ai' | 'config'

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
        cmd: 'openasst login',
        desc: 'Login to OpenAsst platform with your credentials',
        example: 'openasst login',
        output: '✓ Login successful! Welcome back, user@example.com'
      },
      {
        cmd: 'openasst logout',
        desc: 'Logout from current session',
      },
      {
        cmd: 'openasst status',
        desc: 'Show current connection and authentication status',
        example: 'openasst status',
        output: 'Status: Connected\nUser: user@example.com\nServers: 3 configured'
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
  'server': {
    title: 'Server Management',
    icon: '#',
    commands: [
      {
        cmd: 'openasst list servers',
        desc: 'List all configured servers',
        example: 'openasst list servers',
        output: 'ID          NAME           STATUS\n─────────────────────────────────\nsvr-001     production     online\nsvr-002     staging        online\nsvr-003     dev-server     offline'
      },
      {
        cmd: 'openasst connect <server-id>',
        desc: 'Connect to a remote server via SSH',
        example: 'openasst connect svr-001',
        output: 'Connecting to production (192.168.1.100)...\n✓ Connected successfully'
      },
      {
        cmd: 'openasst disconnect',
        desc: 'Disconnect from current server',
      },
      {
        cmd: 'openasst server info <server-id>',
        desc: 'Show detailed server information',
        example: 'openasst server info svr-001',
        output: 'Name: production\nHost: 192.168.1.100\nOS: Ubuntu 22.04\nCPU: 45%  Memory: 62%'
      },
    ]
  },
  'script': {
    title: 'Script Execution',
    icon: '$',
    commands: [
      {
        cmd: 'openasst run <script-name>',
        desc: 'Execute a script from marketplace on connected server',
        example: 'openasst run deploy-nodejs',
        output: 'Running deploy-nodejs on production...\n[1/3] Installing dependencies...\n[2/3] Building application...\n[3/3] Starting service...\n✓ Deployment complete!'
      },
      {
        cmd: 'openasst run <script> --server <id>',
        desc: 'Run script on a specific server',
        example: 'openasst run backup-db --server svr-002',
      },
      {
        cmd: 'openasst list scripts',
        desc: 'List available scripts from marketplace',
      },
      {
        cmd: 'openasst script info <name>',
        desc: 'Show script details and documentation',
      },
    ]
  },
  'ai': {
    title: 'AI Assistant',
    icon: '*',
    commands: [
      {
        cmd: 'openasst chat "<message>"',
        desc: 'Send a message to AI assistant',
        example: 'openasst chat "check disk usage"',
        output: 'AI: I\'ll check the disk usage for you.\n\nFilesystem      Size  Used  Avail  Use%\n/dev/sda1       100G   45G    55G   45%\n/dev/sdb1       500G  200G   300G   40%'
      },
      {
        cmd: 'openasst chat -i',
        desc: 'Start interactive chat mode',
        example: 'openasst chat -i',
        output: 'Entering interactive mode. Type "exit" to quit.\n\nYou: '
      },
      {
        cmd: 'openasst ask "<question>"',
        desc: 'Ask AI a quick question without executing',
        example: 'openasst ask "how to restart nginx"',
      },
    ]
  },
  'config': {
    title: 'Configuration',
    icon: '@',
    commands: [
      {
        cmd: 'openasst config set <key> <value>',
        desc: 'Set a configuration value',
        example: 'openasst config set api_url https://api.example.com',
      },
      {
        cmd: 'openasst config get <key>',
        desc: 'Get a configuration value',
      },
      {
        cmd: 'openasst config list',
        desc: 'List all configuration settings',
        example: 'openasst config list',
        output: 'api_url: https://api.openasst.com\ntheme: dark\nlanguage: en'
      },
      {
        cmd: 'openasst config reset',
        desc: 'Reset configuration to defaults',
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

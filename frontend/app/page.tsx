'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Platform = 'unix' | 'powershell' | 'cmd'

const installCommands: Record<Platform, { label: string; command: string }> = {
  unix: {
    label: 'macOS/Linux',
    command: 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash'
  },
  powershell: {
    label: 'PowerShell',
    command: 'iwr -useb https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.ps1 | iex'
  },
  cmd: {
    label: 'CMD',
    command: 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.bat -o install.bat && install.bat'
  }
}

export default function Home() {
  const router = useRouter()
  const [platform, setPlatform] = useState<Platform>('unix')
  const [copied, setCopied] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  // Handle OAuth callback from URL hash
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        setAuthLoading(true)
        try {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (session) {
            const user = session.user
            const isGitHubUser = user.app_metadata?.provider === 'github'
            const createdAt = new Date(user.created_at).getTime()
            const lastSignIn = new Date(user.last_sign_in_at || user.created_at).getTime()
            const isFirstLogin = Math.abs(lastSignIn - createdAt) < 60000

            if (isGitHubUser && isFirstLogin) {
              localStorage.setItem('github_first_login', 'true')
              router.push('/auth/share-repos')
            } else {
              router.push('/dashboard')
            }
          }
        } catch (err) {
          console.error('OAuth callback error:', err)
        }
        setAuthLoading(false)
      }
    }
    handleOAuthCallback()
  }, [router])

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommands[platform].command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f0d]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Processing login...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0f0d] grid-pattern relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-950/20 via-transparent to-emerald-950/20" />

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Terminal window style header */}
        <div className="terminal-card w-full max-w-3xl mb-8">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-4 text-green-500/70 text-sm font-mono">openasst@terminal ~ </span>
          </div>
          <div className="p-6 font-mono">
            <div className="text-green-400 mb-2">
              <span className="text-green-600">$</span> ./welcome.sh
            </div>
            <div className="text-gray-400 text-sm mb-4">Initializing OpenAsst...</div>
            <div className="flex items-center gap-2 text-green-400">
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full status-online" />
              <span>All systems operational</span>
            </div>
          </div>
        </div>

        {/* Main Title */}
        <div className="text-center mb-12">
          <h1 className="text-6xl md:text-7xl font-bold mb-4 tracking-tight">
            <span className="text-white">Open</span>
            <span className="text-[#00ff41] glow-text">Asst</span>
          </h1>
          <p className="text-xl md:text-2xl text-green-400/80 font-mono mb-2">
            AI-Powered Terminal Assistant
          </p>
          <p className="text-gray-500 font-mono text-sm">
            Natural Language System Operations
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link
            href="/login"
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg btn-glow hover:from-green-500 hover:to-emerald-500 transition-all duration-300 text-center"
          >
            <span className="font-mono">&gt;_ Login</span>
          </Link>
          <Link
            href="/register"
            className="px-8 py-4 border-2 border-green-500/50 text-green-400 font-semibold rounded-lg hover:bg-green-500/10 hover:border-green-400 transition-all duration-300 text-center"
          >
            <span className="font-mono">[ Register ]</span>
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          <FeatureCard
            icon=">"
            title="Smart Task Engine"
            description="Execute any task using natural language commands"
          />
          <FeatureCard
            icon="#"
            title="Cluster Control"
            description="Manage and execute on multiple servers simultaneously"
          />
          <FeatureCard
            icon="$"
            title="API Sharing"
            description="Share AI API with Claude Code, Cursor, Aider"
          />
        </div>

        {/* Second Feature Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full mt-6">
          <FeatureCard
            icon="@"
            title="Terminal Agent"
            description="Deploy OpenAsst agent on remote servers"
          />
          <FeatureCard
            icon="!"
            title="Auto Recovery"
            description="Intelligent error detection and auto-fixing"
          />
          <FeatureCard
            icon="*"
            title="Script Marketplace"
            description="Share and use command templates"
          />
        </div>

        {/* CLI Install Command */}
        <div className="mt-16 w-full max-w-2xl">
          <p className="text-green-500/70 text-sm font-mono mb-3 text-center">Quick Install</p>
          <div className="flex gap-2 mb-3 justify-center">
            {(Object.keys(installCommands) as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1 text-sm rounded font-mono transition ${
                  platform === p
                    ? 'bg-green-600 text-white'
                    : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
                }`}
              >
                {installCommands[p].label}
              </button>
            ))}
          </div>
          <div className="code-block p-4 flex items-center justify-between gap-4">
            <code className="text-green-400 text-sm overflow-x-auto flex-1">
              {installCommands[platform].command}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-sm border border-green-900/50 text-green-400 rounded hover:bg-green-900/20 font-mono shrink-0 transition"
            >
              {copied ? 'copied!' : 'copy'}
            </button>
          </div>
        </div>

        {/* CLI Documentation */}
        <div className="mt-16 w-full max-w-4xl">
          <h2 className="text-2xl font-bold text-white mb-6 text-center font-mono"># CLI Documentation</h2>
          <p className="text-center text-gray-500 mb-6 font-mono text-sm">
            <Link href="/docs" className="text-green-400 hover:text-green-300 underline">
              View full documentation →
            </Link>
          </p>

          {/* Terminal Window */}
          <div className="terminal-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-4 text-green-500/70 text-sm font-mono">openasst --help</span>
            </div>
            <div className="p-6 font-mono text-sm space-y-4">
              {/* Do Task */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst do &quot;install nginx&quot;
                </div>
                <div className="text-gray-500 pl-4">Execute any task with natural language</div>
              </div>

              {/* Assistant */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst assistant
                </div>
                <div className="text-gray-500 pl-4">Start interactive assistant mode</div>
              </div>

              {/* Deploy */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst deploy ./INSTALL.md
                </div>
                <div className="text-gray-500 pl-4">Deploy from documentation</div>
              </div>

              {/* Auto */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst auto &lt;git-url&gt;
                </div>
                <div className="text-gray-500 pl-4">Auto deploy from Git repository</div>
              </div>

              {/* API Share */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst api share
                </div>
                <div className="text-gray-500 pl-4">Share API with Claude Code, Cursor, Aider</div>
              </div>

              {/* Config */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst config
                </div>
                <div className="text-gray-500 pl-4">Configure API key and settings</div>
              </div>

              {/* Devices */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst devices list
                </div>
                <div className="text-gray-500 pl-4">List all cluster devices</div>
              </div>

              {/* Run */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst run &quot;uname -a&quot; --all
                </div>
                <div className="text-gray-500 pl-4">Execute command on all servers</div>
              </div>

              {/* Do Cluster */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst do &quot;install nginx&quot; --all
                </div>
                <div className="text-gray-500 pl-4">AI task on all servers</div>
              </div>

              {/* API Sync */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst api sync --all
                </div>
                <div className="text-gray-500 pl-4">Sync API config to remote devices</div>
              </div>

              {/* Help */}
              <div>
                <div className="text-green-400 mb-1">
                  <span className="text-green-600">$</span> openasst --help
                </div>
                <div className="text-gray-500 pl-4">Show all available commands</div>
              </div>
            </div>
          </div>
        </div>

        {/* Web Dashboard Section */}
        <div className="mt-16 w-full max-w-4xl">
          <h2 className="text-2xl font-bold text-white mb-6 text-center font-mono"># Web Dashboard</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="terminal-card p-4">
              <div className="text-green-400 font-mono mb-2">Server Management</div>
              <div className="text-gray-500 text-sm">Add and manage multiple SSH servers</div>
            </div>
            <div className="terminal-card p-4">
              <div className="text-green-400 font-mono mb-2">Batch Control</div>
              <div className="text-gray-500 text-sm">Execute AI tasks on multiple servers</div>
            </div>
            <div className="terminal-card p-4">
              <div className="text-green-400 font-mono mb-2">Terminal Agent</div>
              <div className="text-gray-500 text-sm">Deploy OpenAsst agent remotely</div>
            </div>
            <div className="terminal-card p-4">
              <div className="text-green-400 font-mono mb-2">Script Marketplace</div>
              <div className="text-gray-500 text-sm">Share and use command templates</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <a
              href="https://github.com/abingyyds/OpenAsst"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-green-400 transition-colors"
              title="GitHub"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
          <p className="text-gray-600 font-mono text-sm">
            Open Source • MIT License • Made with passion
          </p>
        </div>
      </div>
    </main>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="terminal-card p-6 hover:border-green-500/50 transition-all duration-300 group">
      <div className="text-3xl font-mono text-green-500 mb-4 group-hover:text-[#00ff41] transition-colors">
        {icon}_
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  )
}

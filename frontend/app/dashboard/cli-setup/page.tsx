'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { serverApi, Server } from '@/lib/api/servers'

export default function CLISetupPage() {
  const router = useRouter()
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [showServerModal, setShowServerModal] = useState(false)
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [loadingServers, setLoadingServers] = useState(false)
  const [platform, setPlatform] = useState<'unix' | 'powershell' | 'cmd'>('unix')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCommand(text)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const installCommands = {
    unix: 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash',
    powershell: 'iwr -useb https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.ps1 | iex',
    cmd: 'curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.bat -o install.bat && install.bat'
  }

  const loadServers = async () => {
    setLoadingServers(true)
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (err) {
      console.error('Failed to load servers:', err)
    } finally {
      setLoadingServers(false)
    }
  }

  const handleAIInstall = () => {
    setShowServerModal(true)
    loadServers()
  }

  const handleConfirmInstall = () => {
    if (!selectedServerId) return

    // Store install task in sessionStorage
    const installTask = `Install OpenAsst CLI on this server.

Steps:
1. Check if curl and bash are installed
2. Run the install script: curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
3. If the script fails, try manual installation:
   - git clone https://github.com/abingyyds/OpenAsst.git
   - cd OpenAsst/cli && npm install && npm run build && npm link
4. Verify installation: openasst --version`

    sessionStorage.setItem('pendingScript', JSON.stringify({
      id: 'cli-install',
      name: 'Install OpenAsst CLI',
      description: 'AI-assisted CLI installation',
      documentContent: installTask,
      commands: []
    }))

    setShowServerModal(false)
    router.push(`/dashboard/servers/${selectedServerId}`)
  }

  const cliCommands = [
    { cmd: 'openasst do "task description"', desc: 'Execute task with natural language' },
    { cmd: 'openasst assistant', desc: 'Interactive AI assistant' },
    { cmd: 'openasst config', desc: 'Configure API key and settings' },
    { cmd: 'openasst auto <git-url>', desc: 'Auto deploy from Git repo' },
    { cmd: 'openasst deploy <doc-url>', desc: 'Deploy from documentation' },
    { cmd: 'openasst api share', desc: 'Share API with Claude Code, Cursor' }
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-green-400 font-mono">&gt; CLI Setup</h1>
        <p className="text-gray-500 mt-2 font-mono">
          Install OpenAsst CLI for terminal-based AI assistance
        </p>
      </div>

      {/* One-liner Install */}
      <div className="terminal-card p-6 border-green-500/50">
        <h2 className="text-xl font-bold mb-4 text-green-400 font-mono"># Quick Install</h2>

        {/* Platform Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPlatform('unix')}
            className={`px-4 py-2 rounded font-mono text-sm ${
              platform === 'unix'
                ? 'bg-green-600 text-white'
                : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
            }`}
          >
            macOS / Linux
          </button>
          <button
            onClick={() => setPlatform('powershell')}
            className={`px-4 py-2 rounded font-mono text-sm ${
              platform === 'powershell'
                ? 'bg-green-600 text-white'
                : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
            }`}
          >
            PowerShell
          </button>
          <button
            onClick={() => setPlatform('cmd')}
            className={`px-4 py-2 rounded font-mono text-sm ${
              platform === 'cmd'
                ? 'bg-green-600 text-white'
                : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
            }`}
          >
            CMD
          </button>
        </div>

        <div className="bg-[#0a0f0d] rounded-lg p-4 border border-green-900/50">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[#00ff41] font-mono text-sm break-all">
              {platform === 'unix' && '$ '}{platform === 'powershell' && 'PS> '}{platform === 'cmd' && 'C:\\> '}
              {installCommands[platform]}
            </code>
            <button
              onClick={() => copyToClipboard(installCommands[platform])}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono text-sm btn-glow whitespace-nowrap"
            >
              {copiedCommand === installCommands[platform] ? 'copied!' : 'copy'}
            </button>
            {platform === 'unix' && (
              <button
                onClick={handleAIInstall}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500 font-mono text-sm btn-glow whitespace-nowrap"
              >
                {'>'} ai_install
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-3 font-mono">
          After install, run: <code className="text-green-400">openasst config</code> to set your API key
        </p>
      </div>

      {/* Features */}
      <div className="terminal-card p-6">
        <h2 className="text-xl font-bold mb-4 text-green-400 font-mono"># Features</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm font-mono">
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">smart_task_engine</span>
            <p className="text-gray-600 text-xs mt-1">Natural language execution</p>
          </div>
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">security_guard</span>
            <p className="text-gray-600 text-xs mt-1">Block dangerous commands</p>
          </div>
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">auto_recovery</span>
            <p className="text-gray-600 text-xs mt-1">Intelligent error fixing</p>
          </div>
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">api_sharing</span>
            <p className="text-gray-600 text-xs mt-1">Share with Claude Code, Cursor</p>
          </div>
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">auto_deploy</span>
            <p className="text-gray-600 text-xs mt-1">Deploy from Git or docs</p>
          </div>
          <div className="bg-[#0a0f0d] p-3 rounded border border-green-900/50">
            <span className="text-green-400">cross_platform</span>
            <p className="text-gray-600 text-xs mt-1">macOS, Linux, Windows</p>
          </div>
        </div>
      </div>

      {/* CLI Commands Reference */}
      <div className="terminal-card p-6">
        <h2 className="text-xl font-bold mb-4 text-green-400 font-mono"># Commands</h2>
        <div className="bg-[#0a0f0d] rounded-lg p-4 overflow-x-auto border border-green-900/50">
          <table className="w-full text-sm font-mono">
            <tbody>
              {cliCommands.map((item, i) => (
                <tr key={i} className="border-b border-green-900/30 last:border-0">
                  <td className="py-3 pr-4">
                    <code className="text-[#00ff41]">{item.cmd}</code>
                  </td>
                  <td className="py-3 text-gray-500">{item.desc}</td>
                  <td className="py-3 pl-4">
                    <button
                      onClick={() => copyToClipboard(item.cmd)}
                      className="text-xs px-2 py-1 border border-green-900/50 text-green-500 rounded hover:bg-green-900/20"
                    >
                      {copiedCommand === item.cmd ? 'ok' : 'cp'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GitHub Link */}
      <div className="terminal-card p-6 text-center">
        <a
          href="https://github.com/abingyyds/OpenAsst"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
        >
          &gt; view on GitHub
        </a>
      </div>

      {/* Server Selection Modal */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="terminal-card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-green-400 font-mono"># Select Server</h2>
            <p className="text-gray-500 mb-4 font-mono text-sm">
              Choose a server to install OpenAsst CLI
            </p>

            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 mb-4"
              disabled={loadingServers}
            >
              <option value="">-- select server --</option>
              {servers.map(server => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <button
                onClick={() => setShowServerModal(false)}
                className="flex-1 px-4 py-2 border border-green-900/50 text-gray-400 rounded hover:bg-green-900/20 font-mono"
              >
                cancel
              </button>
              <button
                onClick={handleConfirmInstall}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50 font-mono btn-glow"
                disabled={!selectedServerId}
              >
                {'>'} install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

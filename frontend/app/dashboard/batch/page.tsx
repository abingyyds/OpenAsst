'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { serverApi, Server } from '@/lib/api/servers'
import { scriptApi, ScriptTemplate } from '@/lib/api/scripts'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/contexts/LanguageContext'

interface ServerExecution {
  serverId: string
  serverName: string
  status: 'pending' | 'running' | 'success' | 'error'
  progress: number
  currentStep: string
  output: string[]
  error?: string
}

interface BatchHistory {
  id: string
  task: string
  timestamp: string
  servers: { id: string; name: string; status: string }[]
  useCliAgent: boolean
}

export default function BatchExecutePage() {
  const router = useRouter()
  const { language } = useLanguage()
  const [servers, setServers] = useState<Server[]>([])
  const [scripts, setScripts] = useState<ScriptTemplate[]>([])
  const [selectedServers, setSelectedServers] = useState<string[]>([])
  const [selectedScript, setSelectedScript] = useState<ScriptTemplate | null>(null)
  const [task, setTask] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executions, setExecutions] = useState<Map<string, ServerExecution>>(new Map())
  const [hasCustomApi, setHasCustomApi] = useState(false)
  const [showScripts, setShowScripts] = useState(false)
  const [useCliAgent, setUseCliAgent] = useState(false)
  const [batchHistory, setBatchHistory] = useState<BatchHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    loadServers()
    loadScripts()
    checkCustomApi()
    loadBatchHistory()
  }, [])

  const loadBatchHistory = () => {
    try {
      const saved = localStorage.getItem('batchHistory')
      if (saved) {
        setBatchHistory(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load batch history:', e)
    }
  }

  const saveBatchHistory = (history: BatchHistory[]) => {
    try {
      localStorage.setItem('batchHistory', JSON.stringify(history.slice(0, 20)))
    } catch (e) {
      console.error('Failed to save batch history:', e)
    }
  }

  const checkCustomApi = () => {
    const savedConfig = localStorage.getItem('apiConfig')
    if (savedConfig) {
      const config = JSON.parse(savedConfig)
      setHasCustomApi(!!config.anthropicApiKey && config.anthropicApiKey.length > 10)
    } else {
      setHasCustomApi(false)
    }
  }

  const loadServers = async () => {
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const loadScripts = async () => {
    try {
      const data = await scriptApi.getAll()
      setScripts(data)
    } catch (error) {
      console.error('Failed to load scripts:', error)
    }
  }

  const selectScript = (script: ScriptTemplate) => {
    setSelectedScript(script)
    setTask(`Execute script: ${script.name}\n${script.description}`)
    setShowScripts(false)
  }

  const toggleServer = (serverId: string) => {
    setSelectedServers(prev =>
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    )
  }

  const selectAll = () => {
    setSelectedServers(servers.map(s => s.id))
  }

  const deselectAll = () => {
    setSelectedServers([])
  }

  const startBatchExecution = async () => {
    if (selectedServers.length === 0 || !task.trim()) return

    setExecuting(true)

    // Create history entry
    const historyEntry: BatchHistory = {
      id: Date.now().toString(),
      task: task.trim(),
      timestamp: new Date().toISOString(),
      servers: selectedServers.map(id => {
        const server = servers.find(s => s.id === id)
        return { id, name: server?.name || id, status: 'pending' }
      }),
      useCliAgent
    }

    // 初始化所有服务器的执行状态
    const initialExecutions = new Map<string, ServerExecution>()
    selectedServers.forEach(serverId => {
      const server = servers.find(s => s.id === serverId)
      initialExecutions.set(serverId, {
        serverId,
        serverName: server?.name || serverId,
        status: 'pending',
        progress: 0,
        currentStep: 'Waiting...',
        output: []
      })
    })
    setExecutions(initialExecutions)

    // 并行启动所有服务器的执行
    const promises = selectedServers.map(serverId =>
      executeOnServer(serverId, task)
    )

    await Promise.allSettled(promises)

    // Save to history after completion
    setExecutions(prev => {
      const finalServers = historyEntry.servers.map(s => {
        const exec = prev.get(s.id)
        return { ...s, status: exec?.status || 'error' }
      })
      historyEntry.servers = finalServers
      const newHistory = [historyEntry, ...batchHistory].slice(0, 20)
      setBatchHistory(newHistory)
      saveBatchHistory(newHistory)
      return prev
    })

    setExecuting(false)
  }

  const executeOnServer = async (serverId: string, task: string) => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
    const abortController = new AbortController()
    abortControllersRef.current.set(serverId, abortController)

    // 获取当前用户ID
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    // 获取自定义API配置
    const savedConfig = localStorage.getItem('apiConfig')
    const apiConfig = savedConfig ? JSON.parse(savedConfig) : {}
    const customApiKey = apiConfig.anthropicApiKey || ''
    const customBaseUrl = apiConfig.anthropicBaseUrl || ''
    const customModel = apiConfig.anthropicModel || ''

    // CLI Agent 模式：将任务转换为CLI命令
    let actualTask = task
    if (useCliAgent) {
      // 先直接执行配置命令（不通过AI，避免AI拒绝执行）
      if (customApiKey) {
        const configJson = JSON.stringify({
          apiKey: customApiKey,
          baseUrl: customBaseUrl || 'https://api.anthropic.com',
          model: customModel || 'claude-sonnet-4-20250514'
        })
        const configCmd = `mkdir -p ~/.openasst-cli && echo '${configJson}' > ~/.openasst-cli/config.json`

        // 直接执行配置命令
        try {
          const configHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (userId) configHeaders['X-User-Id'] = userId

          await fetch(`${API_BASE_URL}/api/servers/${serverId}/execute`, {
            method: 'POST',
            headers: configHeaders,
            body: JSON.stringify({ command: configCmd })
          })
        } catch (e) {
          console.log('Config sync failed, continuing anyway')
        }
      }

      // Terminal Agent Mode: Install OpenAsst CLI and execute task
      actualTask = `[TERMINAL AGENT MODE - OPENASST PROXY]

Your ONLY job: Install OpenAsst CLI and use it to execute the user's task.

=== STEP 1: Check if openasst is installed ===
Run: which openasst && openasst --version

=== STEP 2: If NOT installed, install OpenAsst ===

**Install command:**
curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash

**After install, if command not found:**
source ~/.bashrc || source ~/.zshrc || true

**Verify:**
which openasst && openasst --version

**If still not found, try these paths:**
- /usr/local/bin/openasst --version
- node ~/.openasst/cli/dist/index.js --version

=== STEP 3: Execute user task ===
openasst do "${task}" -y

**Or if using direct path:**
/usr/local/bin/openasst do "${task}" -y
node ~/.openasst/cli/dist/index.js do "${task}" -y

=== RULES ===
1. You are a PROXY. ONLY install openasst and call it
2. FORBIDDEN: Do not directly execute "${task}" yourself
3. FORBIDDEN: Do not run npm/apt/yum/pip to install software for "${task}"
4. The install script handles Node.js, nvm, wrapper script automatically
5. ONLY openasst can execute the user's task

User's original task: ${task}`
    }

    // 更新状态为运行中
    setExecutions(prev => {
      const newMap = new Map(prev)
      const exec = newMap.get(serverId)
      if (exec) {
        exec.status = 'running'
        exec.currentStep = useCliAgent ? 'Terminal Agent starting...' : 'Connecting to server...'
      }
      return newMap
    })

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (userId) headers['X-User-Id'] = userId
      if (customApiKey) headers['x-api-key'] = customApiKey
      if (customBaseUrl) headers['x-api-base-url'] = customBaseUrl
      if (customModel) headers['x-api-model'] = customModel

      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${serverId}/auto-execute/stream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ task: actualTask, language }),
          signal: abortController.signal
        }
      )

      if (!response.ok) throw new Error('Execution failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Cannot read response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let iterationCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              handleServerEvent(serverId, data, iterationCount)
              if (data.type === 'iteration_start') {
                iterationCount++
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 执行完成
      setExecutions(prev => {
        const newMap = new Map(prev)
        const exec = newMap.get(serverId)
        if (exec && exec.status === 'running') {
          exec.status = 'success'
          exec.progress = 100
          exec.currentStep = '✓ Done'
        }
        return newMap
      })

    } catch (error: any) {
      if (error.name === 'AbortError') return

      setExecutions(prev => {
        const newMap = new Map(prev)
        const exec = newMap.get(serverId)
        if (exec) {
          exec.status = 'error'
          exec.error = error.message
          exec.currentStep = '✗ Failed'
        }
        return newMap
      })
    }
  }

  const handleServerEvent = (serverId: string, data: any, iteration: number) => {
    setExecutions(prev => {
      const newMap = new Map(prev)
      const exec = newMap.get(serverId)
      if (!exec) return prev

      switch (data.type) {
        case 'start':
          exec.currentStep = 'Starting...'
          exec.progress = 5
          break
        case 'iteration_start':
          exec.currentStep = `Iteration ${data.data.iteration} analysis`
          exec.progress = Math.min(10 + iteration * 15, 90)
          break
        case 'status':
          exec.currentStep = data.data.message
          break
        case 'command_start':
          exec.output.push(`$ ${data.data.command}`)
          break
        case 'command_output':
          exec.output.push(data.data.output?.substring(0, 200) || '')
          break
        case 'reasoning':
          exec.currentStep = data.data.reasoning?.substring(0, 50) + '...'
          break
        case 'complete':
          exec.status = 'success'
          exec.progress = 100
          exec.currentStep = '✓ Done'
          break
        case 'error':
          exec.status = 'error'
          exec.error = data.data.message
          exec.currentStep = '✗ Failed'
          break
      }

      return newMap
    })
  }

  const stopAll = () => {
    abortControllersRef.current.forEach(controller => controller.abort())
    abortControllersRef.current.clear()
    setExecuting(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400'
      case 'error': return 'text-red-400'
      case 'running': return 'text-yellow-400'
      default: return 'text-gray-400'
    }
  }

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500'
      case 'error': return 'bg-red-500'
      case 'running': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const completedCount = Array.from(executions.values()).filter(e => e.status === 'success').length
  const errorCount = Array.from(executions.values()).filter(e => e.status === 'error').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-green-400 font-mono">
          AI Batch Control Panel
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-gray-400 hover:text-green-400 font-mono text-sm"
          >
            {showHistory ? 'Hide History' : `History (${batchHistory.length})`}
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-green-400 font-mono"
          >
            Back
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && batchHistory.length > 0 && (
        <div className="terminal-card p-4 mb-4">
          <h3 className="text-green-500 font-mono text-sm mb-3">Execution History</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {batchHistory.map(h => (
              <div key={h.id} className="bg-black/30 p-3 rounded border border-green-900/30">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-green-400 text-sm font-mono truncate flex-1">
                    {h.task.substring(0, 60)}{h.task.length > 60 ? '...' : ''}
                  </div>
                  <div className="text-gray-500 text-xs ml-2">
                    {new Date(h.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 text-xs flex-wrap">
                  {h.servers.map(s => (
                    <span
                      key={s.id}
                      className={`px-2 py-0.5 rounded ${
                        s.status === 'success' ? 'bg-green-900/30 text-green-400' :
                        s.status === 'error' ? 'bg-red-900/30 text-red-400' :
                        'bg-gray-900/30 text-gray-400'
                      }`}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Input */}
      <div className="terminal-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-green-500 font-mono text-sm">
            Task Command
          </label>
          <button
            onClick={() => setShowScripts(!showScripts)}
            className="text-xs px-2 py-1 border border-green-500/50 text-green-400 rounded hover:bg-green-900/20"
            disabled={executing}
          >
            {showScripts ? 'Close' : 'Select Script'}
          </button>
        </div>

        {/* Script Selection */}
        {showScripts && (
          <div className="mb-3 max-h-48 overflow-y-auto border border-green-900/30 rounded p-2 bg-black/30">
            {scripts.length === 0 ? (
              <p className="text-gray-500 text-sm">No scripts available</p>
            ) : (
              scripts.slice(0, 10).map(script => (
                <button
                  key={script.id}
                  onClick={() => selectScript(script)}
                  className="w-full text-left p-2 hover:bg-green-900/20 rounded mb-1"
                >
                  <div className="text-green-400 text-sm font-mono">{script.name}</div>
                  <div className="text-gray-500 text-xs truncate">{script.description}</div>
                </button>
              ))
            )}
          </div>
        )}

        {selectedScript && (
          <div className="mb-2 text-xs text-green-500">
            Selected script: {selectedScript.name}
          </div>
        )}

        <textarea
          value={task}
          onChange={(e) => { setTask(e.target.value); setSelectedScript(null); }}
          placeholder="Enter AI task to execute on all selected servers, or select a script above..."
          className="w-full bg-black/50 border border-green-900/50 rounded p-3 text-green-400 font-mono text-sm resize-none h-24 focus:outline-none focus:border-green-500"
          disabled={executing}
        />

        {/* CLI Agent Mode Toggle */}
        <div className="flex items-center gap-3 mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useCliAgent}
              onChange={(e) => setUseCliAgent(e.target.checked)}
              className="w-4 h-4 accent-green-500"
              disabled={executing}
            />
            <span className="text-green-400 font-mono text-sm">OpenAsst Terminal Agent</span>
          </label>
          {useCliAgent && (
            <span className="text-xs text-gray-500 font-mono">
              (Install & use OpenAsst Agent on each server)
            </span>
          )}
        </div>
      </div>

      {/* Server Selection */}
      <div className="terminal-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-green-500 font-mono text-sm">
            Select Target Servers ({selectedServers.length}/{servers.length})
          </label>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-green-400 hover:text-green-300 font-mono"
              disabled={executing}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-xs text-gray-400 hover:text-gray-300 font-mono"
              disabled={executing}
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {servers.map(server => (
            <button
              key={server.id}
              onClick={() => toggleServer(server.id)}
              disabled={executing}
              className={`p-3 rounded border font-mono text-sm text-left transition ${
                selectedServers.includes(server.id)
                  ? 'border-green-500 bg-green-900/20 text-green-400'
                  : 'border-green-900/30 text-gray-400 hover:border-green-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  selectedServers.includes(server.id) ? 'bg-green-400' : 'bg-gray-600'
                }`} />
                <span className="truncate">{server.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1 truncate">
                {server.host || server.connectionType}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* API Warning */}
      {!hasCustomApi && (
        <div className="terminal-card border-yellow-500/50 p-4 mb-4">
          <p className="text-yellow-400 font-mono text-sm">
            ⚠️ Batch control requires custom API Key
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Please configure your own API Key in settings before using batch control.
          </p>
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="mt-2 px-3 py-1 text-xs border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-900/20"
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Execute Button */}
      <div className="flex gap-3 mb-4">
        {!executing ? (
          <button
            onClick={startBatchExecution}
            disabled={!hasCustomApi || selectedServers.length === 0 || !task.trim()}
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-mono rounded transition"
          >
            {hasCustomApi
              ? `Start Batch Execution (${selectedServers.length} servers)`
              : 'Please configure API Key first'
            }
          </button>
        ) : (
          <button
            onClick={stopAll}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-mono rounded transition"
          >
            Stop All Executions
          </button>
        )}
      </div>

      {/* Execution Status */}
      {executions.size > 0 && (
        <div className="terminal-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-green-500 font-mono">Execution Status</h2>
            <div className="flex gap-4 text-sm font-mono">
              <span className="text-green-400">✓ {completedCount}</span>
              <span className="text-red-400">✗ {errorCount}</span>
              <span className="text-gray-400">
                Total {executions.size}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {Array.from(executions.values()).map(exec => (
              <div
                key={exec.serverId}
                className="bg-black/30 rounded p-3 border border-green-900/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => router.push(`/dashboard/servers/${exec.serverId}`)}
                    className="font-mono text-green-400 hover:text-green-300 hover:underline"
                  >
                    {exec.serverName} →
                  </button>
                  <span className={`font-mono text-sm ${getStatusColor(exec.status)}`}>
                    {exec.currentStep}
                  </span>
                </div>

                {/* 进度条 */}
                <div className="h-2 bg-gray-800 rounded overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${getProgressColor(exec.status)}`}
                    style={{ width: `${exec.progress}%` }}
                  />
                </div>

                {/* 错误信息 */}
                {exec.error && (
                  <div className="mt-2 text-xs text-red-400 font-mono">
                    Error: {exec.error}
                  </div>
                )}

                {/* 最近输出 */}
                {exec.output.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 font-mono max-h-20 overflow-y-auto">
                    {exec.output.slice(-3).map((line, i) => (
                      <div key={i} className="truncate">{line}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

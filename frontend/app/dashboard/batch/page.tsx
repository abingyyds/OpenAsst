'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { serverApi, Server } from '@/lib/api/servers'
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

export default function BatchExecutePage() {
  const router = useRouter()
  const { language } = useLanguage()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServers, setSelectedServers] = useState<string[]>([])
  const [task, setTask] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executions, setExecutions] = useState<Map<string, ServerExecution>>(new Map())
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
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

    // 初始化所有服务器的执行状态
    const initialExecutions = new Map<string, ServerExecution>()
    selectedServers.forEach(serverId => {
      const server = servers.find(s => s.id === serverId)
      initialExecutions.set(serverId, {
        serverId,
        serverName: server?.name || serverId,
        status: 'pending',
        progress: 0,
        currentStep: '等待开始...',
        output: []
      })
    })
    setExecutions(initialExecutions)

    // 并行启动所有服务器的执行
    const promises = selectedServers.map(serverId =>
      executeOnServer(serverId, task)
    )

    await Promise.allSettled(promises)
    setExecuting(false)
  }

  const executeOnServer = async (serverId: string, task: string) => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
    const abortController = new AbortController()
    abortControllersRef.current.set(serverId, abortController)

    // 更新状态为运行中
    setExecutions(prev => {
      const newMap = new Map(prev)
      const exec = newMap.get(serverId)
      if (exec) {
        exec.status = 'running'
        exec.currentStep = '连接服务器...'
      }
      return newMap
    })

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sessions/${serverId}/auto-execute/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, language }),
          signal: abortController.signal
        }
      )

      if (!response.ok) throw new Error('执行失败')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

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
          exec.currentStep = '✓ 完成'
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
          exec.currentStep = '✗ 失败'
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
          exec.currentStep = '开始执行...'
          exec.progress = 5
          break
        case 'iteration_start':
          exec.currentStep = `第 ${data.data.iteration} 轮分析`
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
          exec.currentStep = '✓ 完成'
          break
        case 'error':
          exec.status = 'error'
          exec.error = data.data.message
          exec.currentStep = '✗ 失败'
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
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-green-400 font-mono">
          AI 群控面板
        </h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-green-400 font-mono"
        >
          返回
        </button>
      </div>

      {/* 任务输入 */}
      <div className="terminal-card p-4 mb-4">
        <label className="block text-green-500 font-mono text-sm mb-2">
          任务指令
        </label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="输入要在所有选中服务器上执行的AI任务，例如：安装 Docker 并配置..."
          className="w-full bg-black/50 border border-green-900/50 rounded p-3 text-green-400 font-mono text-sm resize-none h-24 focus:outline-none focus:border-green-500"
          disabled={executing}
        />
      </div>

      {/* 服务器选择 */}
      <div className="terminal-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-green-500 font-mono text-sm">
            选择目标服务器 ({selectedServers.length}/{servers.length})
          </label>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-green-400 hover:text-green-300 font-mono"
              disabled={executing}
            >
              全选
            </button>
            <button
              onClick={deselectAll}
              className="text-xs text-gray-400 hover:text-gray-300 font-mono"
              disabled={executing}
            >
              取消全选
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

      {/* 执行按钮 */}
      <div className="flex gap-3 mb-4">
        {!executing ? (
          <button
            onClick={startBatchExecution}
            disabled={selectedServers.length === 0 || !task.trim()}
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-mono rounded transition"
          >
            开始群控执行 ({selectedServers.length} 台服务器)
          </button>
        ) : (
          <button
            onClick={stopAll}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-mono rounded transition"
          >
            停止所有执行
          </button>
        )}
      </div>

      {/* 执行状态 */}
      {executions.size > 0 && (
        <div className="terminal-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-green-500 font-mono">执行状态</h2>
            <div className="flex gap-4 text-sm font-mono">
              <span className="text-green-400">✓ {completedCount}</span>
              <span className="text-red-400">✗ {errorCount}</span>
              <span className="text-gray-400">
                总计 {executions.size}
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
                  <span className="font-mono text-green-400">
                    {exec.serverName}
                  </span>
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
                    错误: {exec.error}
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

'use client'

import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { serverApi, Server } from '@/lib/api/servers'
import { chatApi, ChatMessage } from '@/lib/api/chat'
import { commandApi } from '@/lib/api/commands'
import { scriptApi, ScriptTemplate } from '@/lib/api/scripts'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export default function ServerDetailPage({ params }: { params: { id: string } }) {
  const [server, setServer] = useState<Server | null>(null)
  const [loading, setLoading] = useState(true)
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [chatMessage, setChatMessage] = useState('')
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [aiAnalysis, setAiAnalysis] = useState<Array<{command: string, analysis: string}>>([])
  const [aiMessages, setAiMessages] = useState<string[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [scripts, setScripts] = useState<ScriptTemplate[]>([])
  const [scriptSearch, setScriptSearch] = useState('')
  const [showScripts, setShowScripts] = useState(false)
  const [autoExecuting, setAutoExecuting] = useState(false)
  const [autoExecuteResult, setAutoExecuteResult] = useState<any>(null)
  const [executionMode, setExecutionMode] = useState<'stream' | 'twoLayer'>('stream')
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showCliPrompt, setShowCliPrompt] = useState(false)
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null)
  const [showCliSuggestion, setShowCliSuggestion] = useState(false)
  const [executionStats, setExecutionStats] = useState<{iterations: number, commands: number, errors: number} | null>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const aiAnalysisRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 检查CLI安装状态
  const checkCliStatus = async () => {
    try {
      const status = await chatApi.getCliStatus()
      setCliInstalled(status.installed)
      if (!status.installed) {
        setShowCliPrompt(true)
      }
    } catch {
      setCliInstalled(false)
    }
  }

  useEffect(() => {
    loadServerData()
    loadScripts()
    checkCliStatus()

    // Load command history from localStorage
    const savedHistory = localStorage.getItem(`command-history-${params.id}`)
    if (savedHistory) {
      try {
        setCommandHistory(JSON.parse(savedHistory))
      } catch (error) {
        console.error('Failed to load command history:', error)
      }
    }
  }, [params.id])

  const loadServerData = async () => {
    try {
      const [serverData, messages] = await Promise.all([
        serverApi.getById(params.id),
        chatApi.getMessages(params.id)
      ])
      setServer(serverData)
      setChatMessages(messages)
    } catch (error) {
      console.error('加载服务器数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadScripts = async () => {
    try {
      const data = await scriptApi.getAll()
      setScripts(data)
    } catch (error) {
      console.error('加载脚本失败:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return

      const newIndex = historyIndex + 1
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()

      const newIndex = historyIndex - 1
      if (newIndex >= 0) {
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      } else if (newIndex === -1) {
        setHistoryIndex(-1)
        setCommand('')
      }
    }
  }

  const clearTerminal = () => {
    setTerminalOutput([])
    setAiAnalysis([])
  }

  const copyTerminalOutput = () => {
    const text = terminalOutput.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      alert('终端输出已复制到剪贴板')
    }).catch(err => {
      console.error('复制失败:', err)
    })
  }

  const downloadTerminalOutput = () => {
    const text = terminalOutput.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `terminal-output-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput, autoScroll])

  // Auto-scroll AI analysis to show latest
  useEffect(() => {
    if (aiAnalysisRef.current) {
      aiAnalysisRef.current.scrollTop = aiAnalysisRef.current.scrollHeight
    }
  }, [aiAnalysis])

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'l',
      ctrlKey: true,
      metaKey: true,
      callback: clearTerminal,
      description: '清空终端'
    },
    {
      key: 'Enter',
      ctrlKey: true,
      metaKey: true,
      callback: () => {
        if (command.trim()) {
          executeCommand()
        }
      },
      description: '执行命令'
    }
  ])

  const executeCommand = async () => {
    if (!command.trim()) return

    const cmd = command
    setCommand('')
    setHistoryIndex(-1)

    // Save to command history
    const newHistory = [cmd, ...commandHistory.filter(h => h !== cmd)].slice(0, 50) // Keep last 50 commands
    setCommandHistory(newHistory)
    localStorage.setItem(`command-history-${params.id}`, JSON.stringify(newHistory))

    setTerminalOutput([...terminalOutput, `$ ${cmd}`, '命令执行中...'])

    // 获取AI模式设置
    const aiMode = localStorage.getItem('ai_mode') || 'auto'

    try {
      const result = await commandApi.execute(params.id, cmd)
      const newOutput = [...terminalOutput, `$ ${cmd}`, result.output]

      setTerminalOutput(newOutput)

      // 根据AI模式自动调用AI解释
      if (aiMode === 'auto') {
        try {
          const aiResponse = await chatApi.chatWithAI(
            params.id,
            `请分析这个命令的执行结果：\n命令：${cmd}\n输出：${result.output}`
          )
          setAiAnalysis(prev => [...prev, {command: cmd, analysis: aiResponse.response}])
        } catch (error) {
          console.error('AI分析失败:', error)
        }
      }
    } catch (error) {
      const errorMsg = `错误: ${error}`
      setTerminalOutput([...terminalOutput, `$ ${cmd}`, errorMsg])

      // 在失败时，auto和error模式都调用AI
      if (aiMode === 'auto' || aiMode === 'error') {
        try {
          const aiResponse = await chatApi.chatWithAI(
            params.id,
            `这个命令执行失败了，请帮我分析原因并提供解决方案：\n命令：${cmd}\n错误：${errorMsg}`
          )
          setAiAnalysis(prev => [...prev, {command: cmd, analysis: aiResponse.response}])
        } catch (aiError) {
          console.error('AI分析失败:', aiError)
        }
      }
    }
  }

  const executeScript = async (script: ScriptTemplate) => {
    setShowScripts(false)
    setTerminalOutput([...terminalOutput, `\n📜 执行脚本: ${script.name}`])

    for (const cmd of script.commands) {
      setTerminalOutput(prev => [...prev, `$ ${cmd}`, '执行中...'])

      try {
        const result = await commandApi.execute(params.id, cmd)
        setTerminalOutput(prev => {
          const newOutput = [...prev]
          newOutput[newOutput.length - 1] = result.output
          return newOutput
        })
      } catch (error) {
        setTerminalOutput(prev => {
          const newOutput = [...prev]
          newOutput[newOutput.length - 1] = `错误: ${error}`
          return newOutput
        })
      }
    }
  }

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return

    const userMessage = chatMessage
    setChatMessage('')

    // 添加用户消息到聊天界面
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      server_id: params.id,
      user_id: 'current-user',
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])

    // 创建AI消息占位符
    const aiMsgId = (Date.now() + 1).toString()
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      server_id: params.id,
      user_id: 'assistant',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, aiMsg])

    try {
      // 使用流式API
      await chatApi.chatWithAIStream(
        params.id,
        userMessage,
        // onChunk: 每次收到新内容时更新消息
        (chunk) => {
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === aiMsgId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          )
        },
        // onComplete: 完成时更新时间戳
        (timestamp) => {
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === aiMsgId
                ? { ...msg, created_at: timestamp }
                : msg
            )
          )
        },
        // onError: 错误处理
        (error) => {
          console.error('AI聊天失败:', error)
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === aiMsgId
                ? { ...msg, content: '抱歉，AI助手暂时无法响应。请稍后再试。' }
                : msg
            )
          )
        }
      )
    } catch (error) {
      console.error('AI聊天失败:', error)
      setChatMessages(prev =>
        prev.map(msg =>
          msg.id === aiMsgId
            ? { ...msg, content: '抱歉，AI助手暂时无法响应。请稍后再试。' }
            : msg
        )
      )
    }
  }

  const handleAutoExecute = async () => {
    if (!chatMessage.trim()) return

    const task = chatMessage
    setChatMessage('')
    setAutoExecuting(true)
    setAutoExecuteResult(null)

    // 清空AI消息和实时分析
    setAiMessages([])
    setAiAnalysis([])

    // 添加用户任务到聊天界面
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      server_id: params.id,
      user_id: 'current-user',
      role: 'user',
      content: `🤖 自动执行任务: ${task}`,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])

    // 在终端显示开始标记
    setTerminalOutput(prev => [...prev, '', '='.repeat(60), `🤖 AI自动执行: ${task}`, '='.repeat(60)])

    let currentIteration = 0
    let fullResult: any = null

    try {
      await chatApi.autoExecuteStream(params.id, task, {
        onStart: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `📋 ${data.message}`])
          })
        },
        onIterationStart: (data) => {
          currentIteration = data.iteration
          flushSync(() => {
            setAiMessages(prev => [...prev, '', `--- 第 ${data.iteration} 轮 ---`])
          })
        },
        onStatus: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `⏳ ${data.message}`])
          })
        },
        onReasoning: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `💭 ${data.reasoning}`])
          })
        },
        onCommandStart: (data) => {
          flushSync(() => {
            // 显示命令，让用户知道下面的输出是哪个命令的
            setTerminalOutput(prev => [...prev, '', `$ ${data.command}`])
          })
        },
        onCommandOutput: (data) => {
          flushSync(() => {
            // 终端显示SSH返回的原始输出，不做任何过滤
            if (data.output) {
              setTerminalOutput(prev => [...prev, data.output])
            }

            // 智能分析命令和输出
            const analyzeCommand = (cmd: string, output: string, exitCode: number): string => {
              if (exitCode !== 0) {
                return `✗ 命令执行失败 (退出码: ${exitCode})`
              }

              const trimmedOutput = output?.trim() || ''

              // which 命令 - 检查软件是否安装
              if (cmd.includes('which ')) {
                const software = cmd.match(/which\s+(\S+)/)?.[1]
                if (trimmedOutput && trimmedOutput.startsWith('/')) {
                  return `✓ ${software} 已安装在 ${trimmedOutput.split('\n')[0]}`
                } else {
                  return `✗ ${software} 未安装`
                }
              }

              // 版本检查命令
              if (cmd.includes('--version') || cmd.includes('-v')) {
                const versionMatch = trimmedOutput.match(/version\s+([0-9.]+)/i)
                if (versionMatch) {
                  return `✓ 检测到版本: ${versionMatch[1]}`
                }
                return `✓ 版本信息: ${trimmedOutput.substring(0, 100)}`
              }

              // yum/apt search
              if (cmd.includes('yum search') || cmd.includes('apt search') || cmd.includes('apt-cache search')) {
                const lines = trimmedOutput.split('\n').filter(line => line.trim())
                return `✓ 搜索到 ${lines.length} 个相关包`
              }

              // yum/apt install
              if (cmd.includes('yum install') || cmd.includes('apt install') || cmd.includes('apt-get install')) {
                if (trimmedOutput.includes('Complete!') || trimmedOutput.includes('done')) {
                  return `✓ 安装成功`
                }
                return `✓ 正在安装...`
              }

              // systemctl
              if (cmd.includes('systemctl')) {
                if (cmd.includes('start')) return `✓ 服务已启动`
                if (cmd.includes('stop')) return `✓ 服务已停止`
                if (cmd.includes('enable')) return `✓ 服务已设置为开机自启`
                if (cmd.includes('status')) return `✓ 服务状态: ${trimmedOutput.substring(0, 50)}`
              }

              // 默认分析
              if (!trimmedOutput) {
                return '✓ 命令执行成功，无输出'
              } else if (trimmedOutput.length > 500) {
                const lines = trimmedOutput.split('\n').length
                return `✓ 命令执行成功，输出 ${lines} 行 (${trimmedOutput.length} 字符)`
              } else {
                return `✓ 命令执行成功`
              }
            }

            const analysis = analyzeCommand(data.command, data.output, data.exitCode)

            setAiAnalysis(prev => [...prev, {
              command: data.command,
              analysis: analysis
            }])
          })
        },
        onIterationComplete: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `✓ 第 ${data.iteration} 轮完成`])
          })
        },
        onComplete: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, '', `✅ ${data.message}`])
          })
        },
        onDone: (data) => {
          fullResult = data
          flushSync(() => {
            // 在终端显示结束标记
            setTerminalOutput(prev => [
              ...prev,
              '='.repeat(60),
              `✅ 执行完成 (共 ${data.iterations || 0} 轮)`,
              '='.repeat(60)
            ])

            // 构建详细的执行摘要
            const summaryLines = [
              '',
              '='.repeat(40),
              `✅ 任务完成 (共${data.iterations || 0}轮)`,
              '='.repeat(40),
              ''
            ]

            // 添加执行历史摘要
            if (data.executionHistory && data.executionHistory.length > 0) {
              summaryLines.push('📋 执行摘要：')
              data.executionHistory.forEach((h: any, i: number) => {
                summaryLines.push(``)
                summaryLines.push(`第${i + 1}轮：`)
                if (h.reasoning) {
                  summaryLines.push(`💭 ${h.reasoning}`)
                }
                if (h.commands && h.commands.length > 0) {
                  summaryLines.push(``)
                  summaryLines.push(`📝 执行的命令：`)
                  h.commands.forEach((cmd: string, idx: number) => {
                    summaryLines.push(`  ${idx + 1}. ${cmd}`)
                  })
                }
                // 显示命令执行结果摘要
                if (h.commandLogs && h.commandLogs.length > 0) {
                  summaryLines.push(``)
                  summaryLines.push(`📊 执行结果：`)
                  h.commandLogs.forEach((log: any, idx: number) => {
                    const status = log.exitCode === 0 ? '✅' : '❌'
                    summaryLines.push(`  ${status} 命令${idx + 1}: 退出码 ${log.exitCode}`)
                  })
                }
              })
            }

            summaryLines.push('')
            summaryLines.push(data.success ? '✅ 任务执行成功' : '⚠️ 任务未完全完成')

            setAiMessages(prev => [...prev, ...summaryLines])
          })
        },
        onError: (data) => {
          flushSync(() => {
            setTerminalOutput(prev => [...prev, '', `❌ 错误: ${data.message}`])
            setAiMessages(prev => [...prev, '', `❌ 错误: ${data.message}`])
          })
        }
      })

      // 添加执行结果到聊天界面
      if (fullResult) {
        const executionDetails = fullResult.executionHistory?.map((h: any, i: number) =>
          `第${i + 1}轮：\n推理：${h.reasoning || '无'}\n命令：${h.commands?.join('; ') || '无'}`
        ).join('\n\n') || '无执行记录'

        const resultMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          server_id: params.id,
          user_id: 'assistant',
          role: 'assistant',
          content: `✅ 自动执行完成\n\n执行轮数: ${fullResult.iterations || 0}\n\n${executionDetails}`,
          created_at: new Date().toISOString()
        }
        setChatMessages(prev => [...prev, resultMsg])
      }
    } catch (error) {
      console.error('自动执行失败:', error)
      setTerminalOutput(prev => [...prev, '', '❌ 自动执行失败', `错误: ${error}`, ''])

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        server_id: params.id,
        user_id: 'assistant',
        role: 'assistant',
        content: '❌ 自动执行失败，请稍后再试。',
        created_at: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, errorMsg])
    } finally {
      setAutoExecuting(false)
    }
  }

  // 两层架构执行：流式执行 + AI深度解读
  const handleTwoLayerExecute = async () => {
    if (!chatMessage.trim()) return

    const task = chatMessage
    setChatMessage('')
    setAutoExecuting(true)
    setAnalysisResult(null)
    setAiMessages([])
    setAiAnalysis([])

    // 创建 AbortController
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // 添加用户任务
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      server_id: params.id,
      user_id: 'current-user',
      role: 'user',
      content: `🔄 智能执行任务: ${task}`,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])

    setTerminalOutput(prev => [...prev, '', '='.repeat(60), `🔄 两层智能执行: ${task}`, '='.repeat(60)])
    setAiMessages(prev => [...prev, '📋 第一层：流式执行引擎启动...'])

    let fullExecutionResult: any = null
    let wasAborted = false

    try {
      // 第一层：使用流式执行，实时显示终端内容
      await chatApi.autoExecuteStream(params.id, task, {
        onStart: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `📋 ${data.message}`])
          })
        },
        onIterationStart: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, '', `--- 第 ${data.iteration} 轮 ---`])
          })
        },
        onStatus: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `⏳ ${data.message}`])
          })
        },
        onReasoning: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `💭 ${data.reasoning}`])
          })
        },
        onCommandStart: (data) => {
          flushSync(() => {
            setTerminalOutput(prev => [...prev, '', `$ ${data.command}`])
          })
        },
        onCommandOutput: (data) => {
          flushSync(() => {
            if (data.output) {
              setTerminalOutput(prev => [...prev, data.output])
            }
            const status = data.exitCode === 0 ? '✓ 成功' : `✗ 失败 (${data.exitCode})`
            setAiAnalysis(prev => [...prev, {
              command: data.command,
              analysis: status
            }])
          })
        },
        onIterationComplete: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `✓ 第 ${data.iteration} 轮完成`])
          })
        },
        onComplete: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, '', `✅ ${data.message}`])
          })
        },
        onDone: (data) => {
          fullExecutionResult = data
          flushSync(() => {
            setTerminalOutput(prev => [...prev, '', '--- 第一层执行完成 ---'])
            setAiMessages(prev => [...prev, `✓ 第一层完成: 共 ${data.iterations || 0} 轮`])
          })
        },
        onError: (data) => {
          flushSync(() => {
            setTerminalOutput(prev => [...prev, `❌ 错误: ${data.message}`])
            setAiMessages(prev => [...prev, `❌ ${data.message}`])
          })
        },
        onAbort: () => {
          wasAborted = true
          flushSync(() => {
            setTerminalOutput(prev => [...prev, '', '⏹️ 执行已被用户终止'])
            setAiMessages(prev => [...prev, '⏹️ 执行已终止'])
          })
        }
      }, abortController.signal)

      // 如果被终止，跳过第二层
      if (wasAborted) {
        setTerminalOutput(prev => [...prev, '='.repeat(60), '⏹️ 执行已终止', '='.repeat(60)])
        return
      }

      // 第二层：AI深度分析
      if (fullExecutionResult && !abortController.signal.aborted) {
        setAiMessages(prev => [...prev, '', '📋 第二层：AI深度分析启动...'])
        setTerminalOutput(prev => [...prev, '', '--- 第二层AI分析中 ---'])

        try {
          const analysisResponse = await chatApi.analyzeExecutionResult(
            task,
            fullExecutionResult,
            fullExecutionResult.systemInfo
          )

          setAnalysisResult(analysisResponse.analysis)
          setAiMessages(prev => [...prev, '✓ 第二层完成: AI分析已生成'])

          const resultMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            server_id: params.id,
            user_id: 'assistant',
            role: 'assistant',
            content: `## AI深度分析\n\n${analysisResponse.analysis}`,
            created_at: new Date().toISOString()
          }
          setChatMessages(prev => [...prev, resultMsg])
        } catch (analysisError) {
          setAiMessages(prev => [...prev, `⚠️ AI分析失败: ${(analysisError as Error).message}`])
        }
      }

      setTerminalOutput(prev => [...prev, '='.repeat(60), '✅ 两层智能执行完成', '='.repeat(60)])

      // 执行完成后，如果CLI未安装，显示安装建议
      if (!cliInstalled && fullExecutionResult) {
        const stats = {
          iterations: fullExecutionResult.iterations || 0,
          commands: fullExecutionResult.executionHistory?.reduce((acc: number, h: any) => acc + (h.commands?.length || 0), 0) || 0,
          errors: fullExecutionResult.executionHistory?.reduce((acc: number, h: any) => acc + (h.commandLogs?.filter((l: any) => l.exitCode !== 0).length || 0), 0) || 0
        }
        setExecutionStats(stats)
        setShowCliSuggestion(true)
      }

    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('两层执行失败:', error)
        setAiMessages(prev => [...prev, `❌ 执行失败: ${(error as Error).message}`])
        setTerminalOutput(prev => [...prev, `❌ 错误: ${error}`])
      }
    } finally {
      setAutoExecuting(false)
      abortControllerRef.current = null
    }
  }

  if (loading) {
    return <div className="text-center py-12">加载中...</div>
  }

  if (!server) {
    return <div className="text-center py-12">服务器不存在</div>
  }

  return (
    <div>
      {/* 服务器信息 - 紧凑横向布局 */}
      <div className="bg-white rounded-lg shadow p-3 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{server.name}</h1>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-600">主机: {server.host}:{server.port}</span>
          <span className="text-gray-600">用户: {server.username}</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              server.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'
            }`}></span>
            <span className="text-gray-600">{server.status}</span>
          </div>
        </div>
      </div>

      {/* CLI安装引导提示 */}
      {showCliPrompt && !cliInstalled && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🚀</span>
              <div>
                <h3 className="font-bold text-purple-800 dark:text-purple-300">安装 OpenAsst CLI 获得更强大的功能</h3>
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  CLI版本提供完整的智能任务引擎：安全检查、错误自动修复、多种动作类型支持
                </p>
                <div className="flex gap-2 mt-3">
                  <a
                    href="/dashboard/cli-setup"
                    className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                  >
                    查看安装指南
                  </a>
                  <button
                    onClick={() => setShowCliPrompt(false)}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300"
                  >
                    稍后提醒
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCliPrompt(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 执行完成后的CLI安装建议 */}
      {showCliSuggestion && !cliInstalled && executionStats && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border border-green-300 dark:border-green-700 rounded-lg p-4 mb-4 animate-pulse">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✨</span>
              <div>
                <h3 className="font-bold text-green-800 dark:text-green-300">任务执行完成！升级到 CLI 版本获得更多功能</h3>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  本次执行: {executionStats.iterations} 轮迭代, {executionStats.commands} 条命令
                  {executionStats.errors > 0 && <span className="text-orange-500"> ({executionStats.errors} 个错误)</span>}
                </p>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">CLI 版本额外功能：</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>🛡️ 安全检查 - 自动检测危险命令</li>
                    <li>🔧 错误自动修复 - 智能分析并修复常见错误</li>
                    <li>📁 文件操作 - 读取、写入、修改文件</li>
                    <li>📦 包管理 - 自动检测并使用正确的包管理器</li>
                    <li>🔍 项目分析 - 深度分析项目结构</li>
                  </ul>
                </div>
                <div className="flex gap-2 mt-3">
                  <a
                    href="/dashboard/cli-setup"
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium"
                  >
                    🚀 立即安装 CLI
                  </a>
                  <button
                    onClick={() => setShowCliSuggestion(false)}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300"
                  >
                    下次再说
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCliSuggestion(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* AI实时分析 - 横跨整个页面，终端风格 */}
      <div ref={aiAnalysisRef} className="bg-gray-900 rounded-lg p-4 mb-4 h-48 overflow-auto">
        <h3 className="text-green-400 font-bold mb-3 font-mono">🤖 AI 实时分析</h3>
        <div className="space-y-3">
          {aiAnalysis.map((item, i) => (
            <div key={i} className="border-l-2 border-green-500 pl-3">
              <div className="text-green-400 font-mono text-xs mb-1">$ {item.command}</div>
              <div className="text-green-300 font-mono text-xs whitespace-pre-wrap">{item.analysis}</div>
            </div>
          ))}
          {aiAnalysis.length === 0 && !analysisResult && (
            <div className="text-green-600 font-mono text-xs">等待命令执行...</div>
          )}
          {/* 两层架构AI分析结果 */}
          {analysisResult && (
            <div className="mt-4 pt-4 border-t border-green-800">
              <div className="text-purple-400 font-bold text-xs mb-2">📊 AI 深度分析</div>
              <div className="text-green-300 font-mono text-xs whitespace-pre-wrap">{analysisResult}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* 左侧：终端区域 - 只显示命令和输出 */}
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-900 rounded-lg p-4 h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b border-green-800 pb-2">
              <h3 className="text-green-400 font-bold font-mono">💻 终端</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2 py-1 text-xs rounded font-mono ${
                    autoScroll
                      ? 'bg-green-700 text-green-100'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                  title="切换自动滚动"
                >
                  {autoScroll ? '📜 自动滚动' : '⏸️ 暂停滚动'}
                </button>
                <button
                  onClick={copyTerminalOutput}
                  className="px-2 py-1 bg-blue-700 text-blue-100 rounded hover:bg-blue-600 font-mono text-xs"
                  title="复制输出"
                >
                  📋 复制
                </button>
                <button
                  onClick={downloadTerminalOutput}
                  className="px-2 py-1 bg-purple-700 text-purple-100 rounded hover:bg-purple-600 font-mono text-xs"
                  title="下载输出"
                >
                  💾 下载
                </button>
                <button
                  onClick={clearTerminal}
                  className="px-2 py-1 bg-red-700 text-red-100 rounded hover:bg-red-600 font-mono text-xs"
                  title="清空终端"
                >
                  🗑️ 清空
                </button>
              </div>
            </div>
            <div ref={terminalRef} className="flex-1 overflow-auto space-y-1">
              {terminalOutput.slice(-1000).map((line, i) => {
                // 根据内容设置不同颜色
                let className = 'font-mono text-sm'
                if (line.includes('error') || line.includes('Error') || line.includes('ERROR') || line.includes('✗')) {
                  className += ' text-red-400'
                } else if (line.includes('warning') || line.includes('Warning') || line.includes('WARN')) {
                  className += ' text-yellow-400'
                } else if (line.includes('success') || line.includes('Success') || line.includes('✓')) {
                  className += ' text-green-400'
                } else if (line.startsWith('$')) {
                  className += ' text-cyan-400 font-bold'
                } else {
                  className += ' text-green-400'
                }

                return <div key={i} className={className}>{line}</div>
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyPress={(e) => e.key === 'Enter' && executeCommand()}
              placeholder="输入命令... (↑↓ 切换历史)"
              className="flex-1 px-4 py-2 border rounded"
            />
            <button
              onClick={executeCommand}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              执行
            </button>
            <button
              onClick={() => setShowScripts(!showScripts)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              📜 命令市场
            </button>
          </div>

          {showScripts && (
            <div className="mt-4 bg-white rounded-lg shadow p-4">
              <h3 className="font-bold mb-3">命令市场</h3>
              <input
                type="text"
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                placeholder="搜索脚本..."
                className="w-full px-3 py-2 border rounded mb-3"
              />
              <div className="max-h-64 overflow-auto space-y-2">
                {scripts
                  .filter(script =>
                    script.name.toLowerCase().includes(scriptSearch.toLowerCase()) ||
                    script.description.toLowerCase().includes(scriptSearch.toLowerCase())
                  )
                  .map(script => (
                    <div
                      key={script.id}
                      onClick={() => executeScript(script)}
                      className="p-3 border rounded hover:bg-blue-50 cursor-pointer"
                    >
                      <div className="font-medium">{script.name}</div>
                      <div className="text-sm text-gray-600">{script.description}</div>
                      <div className="flex gap-1 mt-1">
                        {script.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：AI助手 - 终端风格 */}
        <div className="flex-1 bg-gray-900 rounded-lg shadow p-4 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-3 border-b border-green-800 pb-2">
            <h2 className="text-green-400 font-bold font-mono">🤖 AI助手</h2>
            <button
              onClick={async () => {
                if (confirm('确定要清除对话历史吗？')) {
                  try {
                    await chatApi.clearMessages(params.id)
                    setChatMessages([])
                    setAiMessages([])
                  } catch (error) {
                    console.error('清除历史失败:', error)
                  }
                }
              }}
              className="px-3 py-1 bg-red-700 text-red-100 rounded hover:bg-red-600 font-mono text-xs"
              title="清除对话历史"
            >
              清除历史
            </button>
          </div>

          <div className="flex-1 overflow-auto mb-4 space-y-2">
            {/* 显示对话历史 */}
            {chatMessages.map((msg) => (
              <div key={msg.id} className="font-mono text-sm">
                <span className={msg.role === 'user' ? 'text-cyan-400' : 'text-green-400'}>
                  {msg.role === 'user' ? '👤 用户' : '🤖 AI'}:
                </span>
                <span className="text-gray-300 ml-2">{msg.content}</span>
              </div>
            ))}

            {/* 显示实时AI消息 - 增强视觉效果 */}
            {aiMessages.map((msg, i) => {
              // 根据消息类型设置不同的样式
              let className = 'font-mono text-sm p-2 rounded'
              if (msg.includes('📋') || msg.includes('---')) {
                className += ' text-cyan-400 font-bold'
              } else if (msg.includes('⏳')) {
                className += ' text-yellow-400 animate-pulse'
              } else if (msg.includes('💭')) {
                className += ' text-blue-400 italic'
              } else if (msg.includes('✓') || msg.includes('✅')) {
                className += ' text-green-400'
              } else if (msg.includes('✗') || msg.includes('❌')) {
                className += ' text-red-400'
              } else {
                className += ' text-green-400'
              }

              return (
                <div key={`ai-${i}`} className={className}>
                  {msg}
                </div>
              )
            })}

            {/* 显示加载指示器 */}
            {autoExecuting && (
              <div className="flex items-center gap-2 text-yellow-400 font-mono text-sm animate-pulse">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <span>AI正在分析和执行...</span>
              </div>
            )}

            {chatMessages.length === 0 && aiMessages.length === 0 && !autoExecuting && (
              <div className="text-green-600 font-mono text-sm">等待AI分析...</div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="向AI提问或描述任务..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-green-800 rounded text-green-400 placeholder-green-700 font-mono"
            />
            <button
              onClick={sendChatMessage}
              className="px-4 py-2 bg-green-700 text-green-100 rounded hover:bg-green-600 font-mono"
              disabled={autoExecuting}
            >
              发送
            </button>
            <button
              onClick={handleTwoLayerExecute}
              className="px-4 py-2 bg-purple-700 text-purple-100 rounded hover:bg-purple-600 disabled:opacity-50 font-mono"
              disabled={autoExecuting || !chatMessage.trim()}
              title="智能执行：实时执行 + AI深度分析"
            >
              🤖 智能执行
            </button>
            {autoExecuting && (
              <button
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort()
                  }
                  setAutoExecuting(false)
                }}
                className="px-4 py-2 bg-red-700 text-red-100 rounded hover:bg-red-600 font-mono"
                title="终止执行"
              >
                ⏹️ 终止
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

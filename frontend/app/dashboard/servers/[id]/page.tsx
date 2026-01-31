'use client'

import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useParams } from 'next/navigation'
import { serverApi, Server } from '@/lib/api/servers'
import { chatApi, ChatMessage } from '@/lib/api/chat'
import { commandApi } from '@/lib/api/commands'
import { scriptApi, ScriptTemplate } from '@/lib/api/scripts'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useLanguage } from '@/contexts/LanguageContext'

export default function ServerDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { language } = useLanguage()
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
  const [installingCli, setInstallingCli] = useState(false)
  const [scriptExecuting, setScriptExecuting] = useState(false)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const aiAnalysisRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const scriptAbortRef = useRef<AbortController | null>(null)

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
    const savedHistory = localStorage.getItem(`command-history-${id}`)
    if (savedHistory) {
      try {
        setCommandHistory(JSON.parse(savedHistory))
      } catch (error) {
        console.error('Failed to load command history:', error)
      }
    }

    // Check for pending script from marketplace
    const pendingScript = sessionStorage.getItem('pendingScript')
    if (pendingScript) {
      sessionStorage.removeItem('pendingScript')
      try {
        const script = JSON.parse(pendingScript)
        // Auto-execute the script after a short delay to let the page load
        setTimeout(() => {
          executeScriptFromData(script)
        }, 500)
      } catch (error) {
        console.error('Failed to parse pending script:', error)
      }
    }
  }, [id])

  const loadServerData = async () => {
    try {
      const [serverData, messages] = await Promise.all([
        serverApi.getById(id),
        chatApi.getMessages(id)
      ])
      setServer(serverData)
      setChatMessages(messages)
    } catch (error) {
      console.error('Failed to load server data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadScripts = async () => {
    try {
      const data = await scriptApi.getAll()
      setScripts(data)
    } catch (error) {
      console.error('Failed to load script:', error)
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
      console.error('Copy failed:', err)
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
  }, [aiAnalysis, analysisResult])

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
      description: 'Execute command'
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
    localStorage.setItem(`command-history-${id}`, JSON.stringify(newHistory))

    setTerminalOutput([...terminalOutput, `$ ${cmd}`, 'Executing command...'])

    // 获取AI模式设置
    const aiMode = localStorage.getItem('ai_mode') || 'auto'

    try {
      const result = await commandApi.execute(id, cmd)
      const newOutput = [...terminalOutput, `$ ${cmd}`, result.output]

      setTerminalOutput(newOutput)

      // 根据AI模式自动调用AI解释
      if (aiMode === 'auto') {
        try {
          const aiResponse = await chatApi.chatWithAI(
            id,
            `Please analyze this command execution result:\nCommand: ${cmd}\nOutput: ${result.output}`,
            language
          )
          setAiAnalysis(prev => [...prev, {command: cmd, analysis: aiResponse.response}])
        } catch (error) {
          console.error('AI analysis failed:', error)
        }
      }
    } catch (error) {
      const errorMsg = `错误: ${error}`
      setTerminalOutput([...terminalOutput, `$ ${cmd}`, errorMsg])

      // On failure, auto and error modes both call AI
      if (aiMode === 'auto' || aiMode === 'error') {
        try {
          const aiResponse = await chatApi.chatWithAI(
            id,
            `This command failed, please analyze the cause and provide a solution:\nCommand: ${cmd}\nError: ${errorMsg}`,
            language
          )
          setAiAnalysis(prev => [...prev, {command: cmd, analysis: aiResponse.response}])
        } catch (aiError) {
          console.error('AI analysis failed:', aiError)
        }
      }
    }
  }

  // Execute script - uses AI streaming execution
  const executeScript = (script: ScriptTemplate) => {
    setShowScripts(false)
    executeScriptFromData(script)
  }

  // Execute script from data (used when navigating from marketplace or scripts panel)
  // Uses the same AI streaming execution as handleTwoLayerExecute
  const executeScriptFromData = (script: any) => {
    // Build task description from script
    let taskDescription = `Execute script: ${script.name}\n\n`

    if (script.documentContent) {
      taskDescription += `Follow this guide:\n${script.documentContent}`
    } else if (script.commands && script.commands.length > 0) {
      const cmds = script.commands.map((c: any) =>
        typeof c === 'string' ? c : c.command
      ).filter(Boolean).join('\n')
      taskDescription += `Execute these commands:\n${cmds}`
    } else {
      taskDescription += script.description
    }

    // Use the AI streaming execution
    handleTwoLayerExecute(taskDescription)
  }

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return

    const userMessage = chatMessage
    setChatMessage('')

    // 添加用户消息到聊天界面
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      server_id: id,
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
      server_id: id,
      user_id: 'assistant',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, aiMsg])

    try {
      // 使用流式API
      await chatApi.chatWithAIStream(
        id,
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
          console.error('AI chat failed:', error)
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === aiMsgId
                ? { ...msg, content: 'Sorry, AI assistant is temporarily unavailable. Please try again later.' }
                : msg
            )
          )
        },
        language
      )
    } catch (error) {
      console.error('AI chat failed:', error)
      setChatMessages(prev =>
        prev.map(msg =>
          msg.id === aiMsgId
            ? { ...msg, content: 'Sorry, AI assistant is temporarily unavailable. Please try again later.' }
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
      server_id: id,
      user_id: 'current-user',
      role: 'user',
      content: `🤖 Auto-executing task: ${task}`,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])

    // 在终端显示开始标记
    setTerminalOutput(prev => [...prev, '', '='.repeat(60), `🤖 AI Auto-Execute: ${task}`, '='.repeat(60)])

    let currentIteration = 0
    let fullResult: any = null

    try {
      await chatApi.autoExecuteStream(id, task, {
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
            // Show command so user knows which output belongs to which command
            setTerminalOutput(prev => [...prev, '', `$ ${data.command}`])
          })
        },
        onCommandOutput: (data) => {
          flushSync(() => {
            // 终端显示SSH返回的原始输出，不做任何过滤
            if (data.output) {
              setTerminalOutput(prev => [...prev, data.output])
            }

            // Smart analysis of command and output
            const analyzeCommand = (cmd: string, output: string, exitCode: number): string => {
              if (exitCode !== 0) {
                return `✗ Command failed (exit code: ${exitCode})`
              }

              const trimmedOutput = output?.trim() || ''

              // which command - check if software is installed
              if (cmd.includes('which ')) {
                const software = cmd.match(/which\s+(\S+)/)?.[1]
                if (trimmedOutput && trimmedOutput.startsWith('/')) {
                  return `✓ ${software} 已安装在 ${trimmedOutput.split('\n')[0]}`
                } else {
                  return `✗ ${software} 未安装`
                }
              }

              // Version check command
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
                  return `✓ Installation successful`
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
                return '✓ Command executed, no output'
              } else if (trimmedOutput.length > 500) {
                const lines = trimmedOutput.split('\n').length
                return `✓ Command executed, ${lines} lines (${trimmedOutput.length} chars)`
              } else {
                return `✓ Command executed successfully`
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
              `✅ Execution completed (${data.iterations || 0} rounds)`,
              '='.repeat(60)
            ])

            // Build detailed execution summary
            const summaryLines = [
              '',
              '='.repeat(40),
              `✅ 任务完成 (共${data.iterations || 0}轮)`,
              '='.repeat(40),
              ''
            ]

            // Add execution history summary
            if (data.executionHistory && data.executionHistory.length > 0) {
              summaryLines.push('📋 Execution Summary:')
              data.executionHistory.forEach((h: any, i: number) => {
                summaryLines.push(``)
                summaryLines.push(`第${i + 1}轮：`)
                if (h.reasoning) {
                  summaryLines.push(`💭 ${h.reasoning}`)
                }
                if (h.commands && h.commands.length > 0) {
                  summaryLines.push(``)
                  summaryLines.push(`📝 Commands executed:`)
                  h.commands.forEach((cmd: string, idx: number) => {
                    summaryLines.push(`  ${idx + 1}. ${cmd}`)
                  })
                }
                // Show command execution result summary
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
      }, undefined, language)

      // 添加执行结果到聊天界面
      if (fullResult) {
        const executionDetails = fullResult.executionHistory?.map((h: any, i: number) =>
          `第${i + 1}轮：\n推理：${h.reasoning || '无'}\n命令：${h.commands?.join('; ') || '无'}`
        ).join('\n\n') || '无执行记录'

        const resultMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          server_id: id,
          user_id: 'assistant',
          role: 'assistant',
          content: `✅ Auto-execution completed\n\nRounds: ${fullResult.iterations || 0}\n\n${executionDetails}`,
          created_at: new Date().toISOString()
        }
        setChatMessages(prev => [...prev, resultMsg])
      }
    } catch (error) {
      console.error('自动执行失败:', error)
      setTerminalOutput(prev => [...prev, '', '❌ 自动执行失败', `错误: ${error}`, ''])

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        server_id: id,
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

  // Two-layer architecture: Stream execution + AI deep analysis
  const handleTwoLayerExecute = async (taskInput?: string) => {
    const task = taskInput || chatMessage.trim()
    if (!task) return

    if (!taskInput) setChatMessage('')
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
      server_id: id,
      user_id: 'current-user',
      role: 'user',
      content: `🔄 Smart Execute: ${task}`,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, userMsg])

    setTerminalOutput(prev => [...prev, '', '='.repeat(60), `🔄 Two-layer Smart Execute: ${task}`, '='.repeat(60)])
    setAiMessages(prev => [...prev, '📋 Layer 1: Stream execution engine starting...'])

    let fullExecutionResult: any = null
    let wasAborted = false

    try {
      // 第一层：使用流式执行，实时显示终端内容
      await chatApi.autoExecuteStream(id, task, {
        onStart: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, `📋 ${data.message}`])
          })
        },
        onIterationStart: (data) => {
          flushSync(() => {
            setAiMessages(prev => [...prev, '', `--- Round ${data.iteration} ---`])
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
            setTerminalOutput(prev => [...prev, '', '--- Layer 1 execution completed ---'])
            setAiMessages(prev => [...prev, `✓ Layer 1 completed: ${data.iterations || 0} rounds`])
          })
        },
        onError: (data) => {
          flushSync(() => {
            setTerminalOutput(prev => [...prev, `❌ Error: ${data.message}`])
            setAiMessages(prev => [...prev, `❌ ${data.message}`])
          })
        },
        onAbort: () => {
          wasAborted = true
          flushSync(() => {
            setTerminalOutput(prev => [...prev, '', '⏹️ Execution aborted by user'])
            setAiMessages(prev => [...prev, '⏹️ Execution aborted'])
          })
        }
      }, abortController.signal, language)

      // If aborted, skip layer 2
      if (wasAborted) {
        setTerminalOutput(prev => [...prev, '='.repeat(60), '⏹️ 执行已终止', '='.repeat(60)])
        return
      }

      // Layer 2: AI deep analysis
      if (fullExecutionResult && !abortController.signal.aborted) {
        setAiMessages(prev => [...prev, '', '📋 Layer 2: AI deep analysis starting...'])
        setTerminalOutput(prev => [...prev, '', '--- Layer 2 AI analyzing ---'])

        try {
          const analysisResponse = await chatApi.analyzeExecutionResult(
            task,
            fullExecutionResult,
            fullExecutionResult.systemInfo,
            language
          )

          setAnalysisResult(analysisResponse.analysis)
          setAiMessages(prev => [...prev, '✓ Layer 2 completed: AI analysis generated'])

          const resultMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            server_id: id,
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

      setTerminalOutput(prev => [...prev, '='.repeat(60), '✅ Two-layer smart execution completed', '='.repeat(60)])

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

  // 一键安装CLI
  const handleInstallCli = async () => {
    setInstallingCli(true)
    setShowCliPrompt(false)
    setShowCliSuggestion(false)

    // 设置安装任务
    const installTask = `请在这台服务器上安装 OpenAsst CLI 工具。
安装步骤：
1. 首先检查是否已安装 curl 和 bash
2. 执行一键安装脚本: curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash
3. 如果安装脚本失败，尝试手动安装：
   - git clone https://github.com/abingyyds/OpenAsst.git
   - cd OpenAsst/cli && npm install && npm run build && npm link
4. 验证安装: openasst --version
5. 如果需要配置，运行: openasst config`

    // 使用智能执行来安装
    setChatMessage(installTask)

    // 延迟执行，让状态更新
    setTimeout(() => {
      handleTwoLayerExecute()
      setInstallingCli(false)
    }, 100)
  }

  if (loading) {
    return <div className="text-center py-12 text-green-500 font-mono">loading server...</div>
  }

  if (!server) {
    return <div className="text-center py-12 text-red-400 font-mono">server not found</div>
  }

  return (
    <div>
      {/* Server Info Header */}
      <div className="terminal-card p-3 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-400 font-mono">{server.name}</h1>
        <div className="flex items-center gap-6 text-sm font-mono">
          <span className="text-gray-500">host: <span className="text-green-500">{server.host}:{server.port}</span></span>
          <span className="text-gray-500">user: <span className="text-green-500">{server.username}</span></span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              server.status === 'connected' ? 'bg-green-400 status-online' : 'bg-gray-600'
            }`}></span>
            <span className={server.status === 'connected' ? 'text-green-500' : 'text-gray-500'}>{server.status}</span>
          </div>
        </div>
      </div>

      {/* CLI Install Prompt */}
      {showCliPrompt && !cliInstalled && (
        <div className="terminal-card border-green-500/30 p-4 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-green-500 text-2xl font-mono">$</span>
              <div>
                <h3 className="font-bold text-green-400 font-mono">Install OpenAsst CLI for enhanced features</h3>
                <p className="text-sm text-gray-500 mt-1 font-mono">
                  CLI provides: security checks, auto error recovery, smart task engine
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstallCli}
                    disabled={installingCli || autoExecuting}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-500 disabled:opacity-50 font-mono btn-glow"
                  >
                    {installingCli ? 'installing...' : '> ai_install'}
                  </button>
                  <a
                    href="https://github.com/abingyyds/OpenAsst"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-green-900/50 text-green-500 text-sm rounded hover:bg-green-900/20 font-mono"
                  >
                    github
                  </a>
                  <button
                    onClick={() => setShowCliPrompt(false)}
                    className="px-3 py-2 border border-green-900/50 text-gray-500 text-sm rounded hover:bg-green-900/20 font-mono"
                  >
                    later
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCliPrompt(false)}
              className="text-gray-600 hover:text-green-400 font-mono"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* CLI Install Suggestion after execution */}
      {showCliSuggestion && !cliInstalled && executionStats && (
        <div className="terminal-card border-green-500/30 p-4 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-green-500 text-2xl font-mono">*</span>
              <div>
                <h3 className="font-bold text-green-400 font-mono">
                  Task complete! Upgrade to CLI for more power
                </h3>
                <p className="text-sm text-gray-500 mt-1 font-mono">
                  stats: {executionStats.iterations} iterations, {executionStats.commands} commands
                  {executionStats.errors > 0 && (
                    <span className="text-red-400"> ({executionStats.errors} errors)</span>
                  )}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 font-mono">
                  <span># security_check</span>
                  <span># auto_recovery</span>
                  <span># file_operations</span>
                  <span># smart_packages</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstallCli}
                    disabled={installingCli || autoExecuting}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-500 disabled:opacity-50 font-mono btn-glow"
                  >
                    {installingCli ? 'installing...' : '> install_cli'}
                  </button>
                  <a
                    href="https://github.com/abingyyds/OpenAsst"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-green-900/50 text-green-500 text-sm rounded hover:bg-green-900/20 font-mono"
                  >
                    github
                  </a>
                  <button
                    onClick={() => setShowCliSuggestion(false)}
                    className="px-3 py-2 border border-green-900/50 text-gray-500 text-sm rounded hover:bg-green-900/20 font-mono"
                  >
                    later
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCliSuggestion(false)}
              className="text-gray-600 hover:text-green-400 font-mono"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* AI Real-time Analysis */}
      <div className="terminal-card p-4 mb-4 h-64 flex flex-col">
        <h3 className="text-green-400 font-bold mb-3 font-mono flex-shrink-0"># AI Analysis</h3>
        <div ref={aiAnalysisRef} className="flex-1 overflow-auto space-y-3">
          {aiAnalysis.map((item, i) => (
            <div key={i} className="border-l-2 border-green-500 pl-3">
              <div className="text-[#00ff41] font-mono text-xs mb-1">$ {item.command}</div>
              <div className="text-green-300 font-mono text-xs whitespace-pre-wrap">{item.analysis}</div>
            </div>
          ))}
          {aiAnalysis.length === 0 && !analysisResult && (
            <div className="text-green-600 font-mono text-xs">waiting for commands...</div>
          )}
          {/* Two-layer AI analysis result */}
          {analysisResult && (
            <div className="mt-4 pt-4 border-t border-green-800">
              <div className="text-emerald-400 font-bold text-xs mb-2 font-mono"># Deep Analysis</div>
              <div className="text-green-300 font-mono text-xs whitespace-pre-wrap">{analysisResult}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Terminal Area */}
        <div className="flex-1 flex flex-col">
          <div className="terminal-card p-4 h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b border-green-800 pb-2">
              <h3 className="text-green-400 font-bold font-mono"># Terminal</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2 py-1 text-xs rounded font-mono ${
                    autoScroll
                      ? 'bg-green-700 text-green-100'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                  title="Toggle auto-scroll"
                >
                  {autoScroll ? 'scroll:on' : 'scroll:off'}
                </button>
                <button
                  onClick={copyTerminalOutput}
                  className="px-2 py-1 border border-green-900/50 text-green-500 rounded hover:bg-green-900/20 font-mono text-xs"
                  title="Copy output"
                >
                  copy
                </button>
                <button
                  onClick={downloadTerminalOutput}
                  className="px-2 py-1 border border-green-900/50 text-green-500 rounded hover:bg-green-900/20 font-mono text-xs"
                  title="Download output"
                >
                  save
                </button>
                <button
                  onClick={clearTerminal}
                  className="px-2 py-1 border border-red-900/50 text-red-400 rounded hover:bg-red-900/20 font-mono text-xs"
                  title="Clear terminal"
                >
                  clear
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
              placeholder="enter command... (up/down for history)"
              className="flex-1 px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
            />
            <button
              onClick={executeCommand}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
            >
              run
            </button>
            <button
              onClick={() => setShowScripts(!showScripts)}
              className="px-4 py-2 border border-green-500/50 text-green-400 rounded hover:bg-green-900/20 font-mono"
              disabled={scriptExecuting}
            >
              $ scripts
            </button>
            {scriptExecuting && (
              <button
                onClick={() => {
                  if (scriptAbortRef.current) {
                    scriptAbortRef.current.abort()
                  }
                }}
                className="px-4 py-2 border border-red-500/50 text-red-400 rounded hover:bg-red-900/20 font-mono animate-pulse"
              >
                stop script
              </button>
            )}
          </div>

          {showScripts && (
            <div className="mt-4 terminal-card p-4">
              <h3 className="font-bold mb-3 text-green-400 font-mono"># Script Marketplace</h3>
              <input
                type="text"
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                placeholder="search scripts..."
                className="w-full px-3 py-2 bg-[#0a0f0d] border border-green-900/50 rounded mb-3 text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
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
                      className="p-3 border border-green-900/50 rounded hover:border-green-500/50 cursor-pointer bg-[#0a0f0d]"
                    >
                      <div className="font-medium text-green-400 font-mono">{script.name}</div>
                      <div className="text-sm text-gray-500">{script.description}</div>
                      <div className="flex gap-1 mt-1">
                        {script.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-green-900/30 text-green-500 text-xs rounded font-mono">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Assistant */}
        <div className="flex-1 terminal-card p-4 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-3 border-b border-green-800 pb-2">
            <h2 className="text-green-400 font-bold font-mono"># AI Assistant</h2>
            <button
              onClick={async () => {
                if (confirm('Clear chat history?')) {
                  try {
                    await chatApi.clearMessages(id)
                    setChatMessages([])
                    setAiMessages([])
                  } catch (error) {
                    console.error('Failed to clear history:', error)
                  }
                }
              }}
              className="px-3 py-1 border border-red-900/50 text-red-400 rounded hover:bg-red-900/20 font-mono text-xs"
              title="Clear history"
            >
              clear
            </button>
          </div>

          <div className="flex-1 overflow-auto mb-4 space-y-2">
            {/* Chat history */}
            {chatMessages.map((msg) => (
              <div key={msg.id} className="font-mono text-sm">
                <span className={msg.role === 'user' ? 'text-cyan-400' : 'text-[#00ff41]'}>
                  {msg.role === 'user' ? '> user' : '$ ai'}:
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

            {/* Loading indicator */}
            {autoExecuting && (
              <div className="flex items-center gap-2 text-green-400 font-mono text-sm animate-pulse">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <span>AI processing...</span>
              </div>
            )}

            {chatMessages.length === 0 && aiMessages.length === 0 && !autoExecuting && (
              <div className="text-green-600 font-mono text-sm">waiting for input...</div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="ask AI or describe task..."
              className="flex-1 px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-400 placeholder-gray-600 font-mono focus:outline-none focus:border-green-500"
            />
            <button
              onClick={sendChatMessage}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono"
              disabled={autoExecuting}
            >
              send
            </button>
            <button
              onClick={() => handleTwoLayerExecute()}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50 font-mono btn-glow"
              disabled={autoExecuting || !chatMessage.trim()}
              title="Smart execute: real-time + AI analysis"
            >
              {'>'} execute
            </button>
            {autoExecuting && (
              <button
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort()
                  }
                  setAutoExecuting(false)
                }}
                className="px-4 py-2 border border-red-500/50 text-red-400 rounded hover:bg-red-900/20 font-mono"
                title="Stop execution"
              >
                stop
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

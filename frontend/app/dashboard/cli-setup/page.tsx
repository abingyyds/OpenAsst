'use client'

import { useState, useEffect } from 'react'
import { chatApi } from '@/lib/api/chat'

interface CliStatus {
  installed: boolean
  version: string | null
  configured: boolean
  apiKeySynced: boolean
  lastSync: string | null
}

export default function CLISetupPage() {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // 检查CLI状态
  const checkCliStatus = async () => {
    try {
      const status = await chatApi.getCliStatus()
      setCliStatus(status)

      // 根据状态设置当前步骤
      if (status.installed && status.apiKeySynced) {
        setCurrentStep(6) // 全部完成
      } else if (status.installed) {
        setCurrentStep(5) // 需要同步配置
      }
    } catch (error) {
      console.error('检查CLI状态失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkCliStatus()
  }, [])

  // 同步API配置
  const syncConfig = async () => {
    setSyncing(true)
    setSyncMessage(null)

    try {
      // 从localStorage获取API配置
      const apiKey = localStorage.getItem('anthropic_api_key')
      const baseUrl = localStorage.getItem('anthropic_base_url')
      const model = localStorage.getItem('anthropic_model')

      if (!apiKey) {
        setSyncMessage('请先在API设置页面配置API密钥')
        return
      }

      const result = await chatApi.syncCliConfig({
        apiKey,
        baseUrl: baseUrl || undefined,
        model: model || undefined
      })

      setSyncMessage(result.message)
      await checkCliStatus()
    } catch (error) {
      setSyncMessage('同步失败: ' + (error as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCommand(text)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const installSteps = [
    {
      title: '检查 Node.js',
      description: '确保已安装 Node.js 18+',
      command: 'node --version'
    },
    {
      title: '克隆项目',
      description: '克隆 OpenAsst 仓库',
      command: 'git clone https://github.com/your-repo/openasst.git'
    },
    {
      title: '安装依赖',
      description: '进入CLI目录并安装依赖',
      command: 'cd openasst/cli && npm install'
    },
    {
      title: '构建CLI',
      description: '编译TypeScript',
      command: 'npm run build'
    },
    {
      title: '全局安装',
      description: '链接到全局命令',
      command: 'npm link'
    },
    {
      title: '同步配置',
      description: '将前端API配置同步到CLI',
      command: null // 使用按钮
    }
  ]

  const cliCommands = [
    { cmd: 'openasst do "任务描述"', desc: '自然语言执行任务' },
    { cmd: 'openasst assistant', desc: '交互式AI助手' },
    { cmd: 'openasst analyze', desc: '分析当前项目' },
    { cmd: 'openasst auto <git-url>', desc: '自动部署项目' },
    { cmd: 'openasst deploy <doc>', desc: '从文档部署' },
    { cmd: 'openasst market list', desc: '浏览脚本市场' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">检查CLI状态...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CLI 工具设置</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          安装 OpenAsst CLI，在终端中使用AI助手，与前端协同工作
        </p>
      </div>

      {/* CLI状态卡片 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">CLI 状态</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            label="安装状态"
            value={cliStatus?.installed ? '已安装' : '未安装'}
            status={cliStatus?.installed ? 'success' : 'warning'}
          />
          <StatusCard
            label="版本"
            value={cliStatus?.version || '-'}
            status={cliStatus?.version ? 'success' : 'neutral'}
          />
          <StatusCard
            label="配置同步"
            value={cliStatus?.apiKeySynced ? '已同步' : '未同步'}
            status={cliStatus?.apiKeySynced ? 'success' : 'warning'}
          />
          <StatusCard
            label="上次同步"
            value={cliStatus?.lastSync ? new Date(cliStatus.lastSync).toLocaleDateString() : '-'}
            status="neutral"
          />
        </div>

        {/* 同步按钮 */}
        {cliStatus?.installed && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700">
            <button
              onClick={syncConfig}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? '同步中...' : '同步API配置到CLI'}
            </button>
            {syncMessage && (
              <p className={`mt-2 text-sm ${syncMessage.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
                {syncMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 安装步骤 */}
      {!cliStatus?.installed && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">安装步骤</h2>
          <div className="space-y-4">
            {installSteps.map((step, index) => (
              <StepCard
                key={index}
                step={index + 1}
                title={step.title}
                description={step.description}
                command={step.command}
                isActive={index === currentStep}
                isComplete={index < currentStep}
                onCopy={copyToClipboard}
                copied={copiedCommand === step.command}
              />
            ))}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
            >
              上一步
            </button>
            <button
              onClick={() => setCurrentStep(Math.min(installSteps.length - 1, currentStep + 1))}
              disabled={currentStep === installSteps.length - 1}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              下一步
            </button>
            <button
              onClick={checkCliStatus}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 ml-auto"
            >
              刷新状态
            </button>
          </div>
        </div>
      )}

      {/* 两层架构说明 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">两层智能架构</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">1</span>
              <h3 className="font-bold">CLI 执行层</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              CLI工具负责智能任务执行：分析任务、规划步骤、执行命令、收集结果。
              借鉴智能任务引擎，支持多轮迭代、错误恢复、安全检查。
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">2</span>
              <h3 className="font-bold">前端解读层</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              前端负责结果解读：分析执行结果、诊断问题、提供解决方案、给出优化建议。
              为用户提供清晰的可视化反馈和专业的技术指导。
            </p>
          </div>
        </div>
      </div>

      {/* CLI命令参考 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">CLI 命令参考</h2>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <tbody>
              {cliCommands.map((item, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0">
                  <td className="py-3 pr-4">
                    <code className="text-cyan-400">{item.cmd}</code>
                  </td>
                  <td className="py-3 text-gray-400">{item.desc}</td>
                  <td className="py-3 pl-4">
                    <button
                      onClick={() => copyToClipboard(item.cmd)}
                      className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600"
                    >
                      {copiedCommand === item.cmd ? '已复制' : '复制'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// 状态卡片组件
function StatusCard({ label, value, status }: {
  label: string
  value: string
  status: 'success' | 'warning' | 'error' | 'neutral'
}) {
  const statusColors = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }

  return (
    <div className={`rounded-lg p-3 ${statusColors[status]}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  )
}

// 步骤卡片组件
function StepCard({ step, title, description, command, isActive, isComplete, onCopy, copied }: {
  step: number
  title: string
  description: string
  command: string | null
  isActive: boolean
  isComplete: boolean
  onCopy: (text: string) => void
  copied: boolean
}) {
  return (
    <div className={`border rounded-lg p-4 ${
      isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' :
      isComplete ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
      'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          isComplete ? 'bg-green-500 text-white' :
          isActive ? 'bg-blue-500 text-white' :
          'bg-gray-200 dark:bg-gray-700'
        }`}>
          {isComplete ? '✓' : step}
        </div>
        <div className="flex-1">
          <h3 className="font-bold">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{description}</p>
          {command && (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 text-green-400 px-3 py-2 rounded font-mono text-sm">
                $ {command}
              </code>
              <button
                onClick={() => onCopy(command)}
                className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

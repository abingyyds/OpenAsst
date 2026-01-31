'use client'

import { useState, useEffect } from 'react'
import { checkLocalAgent, getInstallCommand, AgentInfo } from '@/lib/localAgent'

interface LocalAgentSetupProps {
  onConnected: (info: AgentInfo) => void
}

export default function LocalAgentSetup({ onConnected }: LocalAgentSetupProps) {
  const [checking, setChecking] = useState(true)
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
  const [platform, setPlatform] = useState<'unix' | 'windows'>('unix')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // 检测操作系统
    if (typeof window !== 'undefined') {
      const isWindows = navigator.platform.toLowerCase().includes('win')
      setPlatform(isWindows ? 'windows' : 'unix')
    }
    checkAgent()
  }, [])

  const checkAgent = async () => {
    setChecking(true)
    const info = await checkLocalAgent()
    setAgentInfo(info)
    setChecking(false)
    if (info) {
      onConnected(info)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(getInstallCommand(platform))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (checking) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-3"></div>
        <p className="text-green-400 font-mono text-sm">检测本地代理...</p>
      </div>
    )
  }

  if (agentInfo) {
    return (
      <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          <span className="text-green-400 font-mono">本地代理已连接</span>
        </div>
        <div className="text-sm text-gray-400 font-mono space-y-1">
          <p>主机: {agentInfo.hostname}</p>
          <p>用户: {agentInfo.username}</p>
          <p>系统: {agentInfo.platform}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4">
        <p className="text-yellow-400 font-mono text-sm mb-2">
          [提示] 需要安装本地代理才能连接本地终端
        </p>
        <p className="text-gray-400 text-xs">
          本地代理是一个轻量级程序，运行在你的电脑上，让浏览器可以安全地执行本地命令。
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setPlatform('unix')}
          className={`px-3 py-1 text-sm rounded font-mono transition ${
            platform === 'unix'
              ? 'bg-green-600 text-white'
              : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
          }`}
        >
          macOS/Linux
        </button>
        <button
          onClick={() => setPlatform('windows')}
          className={`px-3 py-1 text-sm rounded font-mono transition ${
            platform === 'windows'
              ? 'bg-green-600 text-white'
              : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'
          }`}
        >
          Windows
        </button>
      </div>

      <div className="bg-[#0a0f0d] border border-green-900/50 rounded-lg p-3">
        <p className="text-green-500/70 text-xs font-mono mb-2">在终端运行:</p>
        <div className="flex items-center gap-2">
          <code className="text-green-400 text-sm flex-1 overflow-x-auto">
            {getInstallCommand(platform)}
          </code>
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs border border-green-900/50 text-green-400 rounded hover:bg-green-900/20 font-mono shrink-0"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <button
        onClick={checkAgent}
        className="w-full py-2 border border-green-500/50 text-green-400 rounded-lg hover:bg-green-900/20 font-mono text-sm"
      >
        重新检测
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { scriptApi } from '@/lib/api/scripts'
import Link from 'next/link'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

interface Statistics {
  totalServers: number
  totalScripts: number
  totalExecutions: number
  totalAiInteractions: number
  currentModel: string
  lastUpdated: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Statistics>({
    totalServers: 0,
    totalScripts: 0,
    totalExecutions: 0,
    totalAiInteractions: 0,
    currentModel: 'Loading...',
    lastUpdated: ''
  })
  const [popularScripts, setPopularScripts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentModel, setCurrentModel] = useState('Loading...')
  const [modelName, setModelName] = useState('Loading...')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch statistics
        const statsResponse = await fetch(`${API_BASE_URL}/api/statistics`)
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats(statsData)
        }

        // Fetch popular scripts
        const scripts = await scriptApi.getPopular(5)
        setPopularScripts(scripts)

        // Get current model from localStorage
        const savedModel = localStorage.getItem('anthropic_model') || 'claude-3-5-sonnet-20241022'
        setCurrentModel(savedModel)

        // Fetch model list to get the display name
        const savedConfig = localStorage.getItem('apiConfig')
        if (savedConfig) {
          const config = JSON.parse(savedConfig)
          if (config.anthropicApiKey) {
            const modelsResponse = await fetch(`${API_BASE_URL}/api/models`, {
              headers: {
                'x-api-key': config.anthropicApiKey,
                'x-api-base-url': config.anthropicBaseUrl || ''
              }
            })
            if (modelsResponse.ok) {
              const models = await modelsResponse.json()
              if (!models.error) {
                const modelInfo = models.find((m: any) => m.id === savedModel)
                setModelName(modelInfo ? modelInfo.name : savedModel)
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">仪表板</h1>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">服务器总数</h3>
          <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.totalServers}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">脚本总数</h3>
          <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.totalScripts}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">执行次数</h3>
          <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.totalExecutions}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">AI对话次数</h3>
          <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.totalAiInteractions}</p>
        </div>
      </div>

      {/* AI Model Info */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-blue-900">当前 AI 模型</h3>
            <p className="text-lg font-semibold text-blue-700 mt-1">{modelName}</p>
            <p className="text-xs text-blue-600 mt-1">{currentModel}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            更改设置
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Start Section */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">快速开始</h2>
          <p className="text-gray-600 mb-4">欢迎使用 OpenAsst！开始管理你的服务器。</p>
          <div className="space-y-3">
            <Link
              href="/dashboard/servers"
              className="block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-center"
            >
              添加服务器
            </Link>
            <Link
              href="/dashboard/marketplace"
              className="block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-center"
            >
              浏览脚本市场
            </Link>
            <Link
              href="/dashboard/marketplace?create=true"
              className="block px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-center"
            >
              创建新脚本
            </Link>
          </div>
        </div>

        {/* Popular Scripts Widget */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">热门脚本</h2>
            <Link href="/dashboard/marketplace" className="text-blue-600 hover:text-blue-700 text-sm">
              查看全部 →
            </Link>
          </div>
          {loading ? (
            <p className="text-gray-500">加载中...</p>
          ) : popularScripts.length === 0 ? (
            <p className="text-gray-500">暂无脚本</p>
          ) : (
            <div className="space-y-3">
              {popularScripts.map((script) => (
                <div
                  key={script.id}
                  className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">{script.name}</h3>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{script.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                          {script.category || 'custom'}
                        </span>
                        <span className="text-xs text-gray-500">
                          ❤️ {script.likeCount || 0}
                        </span>
                        <span className="text-xs text-gray-500">
                          🔄 {script.usageCount || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

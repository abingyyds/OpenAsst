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
        const statsResponse = await fetch(`${API_BASE_URL}/api/statistics`)
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats(statsData)
        }

        const scripts = await scriptApi.getPopular(5)
        setPopularScripts(scripts)

        const savedModel = localStorage.getItem('anthropic_model') || 'claude-3-5-sonnet-20241022'
        setCurrentModel(savedModel)

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
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-900/30 border border-green-500/30 rounded-full">
          <span className="w-2 h-2 bg-green-400 rounded-full status-online" />
          <span className="text-green-400 text-sm font-mono">online</span>
        </span>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="servers" value={loading ? '...' : stats.totalServers} icon="#" />
        <StatCard label="scripts" value={loading ? '...' : stats.totalScripts} icon="$" />
        <StatCard label="executions" value={loading ? '...' : stats.totalExecutions} icon=">" />
        <StatCard label="ai_calls" value={loading ? '...' : stats.totalAiInteractions} icon="@" />
      </div>

      {/* AI Model Info */}
      <div className="terminal-card p-4 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-mono text-green-500">current_model:</h3>
            <p className="text-lg font-semibold text-[#00ff41] mt-1 font-mono">{modelName}</p>
            <p className="text-xs text-green-600/70 mt-1 font-mono">{currentModel}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-500 font-mono btn-glow"
          >
            {'>'} configure
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Start Section */}
        <div className="terminal-card p-6">
          <h2 className="text-xl font-bold mb-4 text-white font-mono">{'>'} Quick Start</h2>
          <p className="text-gray-400 mb-4 font-mono text-sm">Welcome to OpenAsst! Start managing your servers.</p>
          <div className="space-y-3">
            <Link
              href="/dashboard/servers"
              className="block px-4 py-3 bg-green-600 text-white rounded hover:bg-green-500 text-center font-mono btn-glow"
            >
              # add_server
            </Link>
            <Link
              href="/dashboard/marketplace"
              className="block px-4 py-3 border border-green-500/50 text-green-400 rounded hover:bg-green-900/20 text-center font-mono"
            >
              $ browse_marketplace
            </Link>
            <Link
              href="/dashboard/marketplace?create=true"
              className="block px-4 py-3 border border-green-500/50 text-green-400 rounded hover:bg-green-900/20 text-center font-mono"
            >
              @ create_script
            </Link>
          </div>
        </div>

        {/* Popular Scripts Widget */}
        <div className="terminal-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white font-mono">{'>'} Popular Scripts</h2>
            <Link href="/dashboard/marketplace" className="text-green-400 hover:text-green-300 text-sm font-mono">
              view_all -&gt;
            </Link>
          </div>
          {loading ? (
            <p className="text-gray-500 font-mono">loading...</p>
          ) : popularScripts.length === 0 ? (
            <p className="text-gray-500 font-mono">no scripts found</p>
          ) : (
            <div className="space-y-3">
              {popularScripts.map((script) => (
                <div
                  key={script.id}
                  className="border border-green-900/50 rounded-lg p-3 hover:border-green-500/50 transition-colors bg-[#0a0f0d]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-green-400 font-mono">{script.name}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{script.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs px-2 py-1 bg-green-900/30 text-green-500 rounded font-mono">
                          {script.category || 'custom'}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          +{script.likeCount || 0}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          x{script.usageCount || 0}
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

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="terminal-card p-6 group hover:border-green-500/50 transition-all">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-green-500/70 text-sm font-mono">{label}:</h3>
        <span className="text-green-700 group-hover:text-green-500 transition-colors">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-[#00ff41] font-mono">{value}</p>
    </div>
  )
}

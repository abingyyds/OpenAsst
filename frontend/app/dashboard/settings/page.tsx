'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ApiConfig {
  anthropicApiKey?: string
  anthropicBaseUrl?: string
  anthropicModel?: string
  tavilyApiKey?: string
  serperApiKey?: string
}

interface Model {
  id: string
  name: string
  description: string
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export default function SettingsPage() {
  const router = useRouter()
  const [config, setConfig] = useState<ApiConfig>({})
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    const savedConfig = localStorage.getItem('apiConfig')
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig)
      setConfig(parsedConfig)

      // 使用保存的配置获取模型列表
      if (parsedConfig.anthropicApiKey) {
        fetch(`${API_BASE_URL}/api/models`, {
          headers: {
            'x-api-key': parsedConfig.anthropicApiKey,
            'x-api-base-url': parsedConfig.anthropicBaseUrl || ''
          }
        })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              console.error('获取模型列表失败:', data.error)
              // 不清空列表，保留之前的数据
            } else {
              console.log('获取到的模型列表:', data)
              console.log('模型数量:', data.length)
              setModels(data)
            }
          })
          .catch(err => {
            console.error('Failed to fetch models:', err)
            // 不清空列表，保留之前的数据
          })
      } else {
        console.log('未配置API Key，无法获取模型列表')
      }
    } else {
      console.log('未找到保存的配置')
      // 不清空列表，保留之前的数据
    }
  }, [])

  const handleFetchModels = async () => {
    if (!config.anthropicApiKey) {
      setFetchError('请先填写 API Key')
      return
    }

    setFetchingModels(true)
    setFetchError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/models/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: config.anthropicApiKey,
          baseUrl: config.anthropicBaseUrl
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '获取模型列表失败')
      }

      setModels(data.models)

      // Show validation status
      if (data.validated) {
        setFetchError('✓ API密钥验证成功')
        setTimeout(() => setFetchError(''), 3000)
      } else {
        setFetchError('⚠️ ' + (data.message || 'API密钥未验证'))
      }
    } catch (error: any) {
      setFetchError('❌ ' + error.message)
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSave = () => {
    localStorage.setItem('apiConfig', JSON.stringify(config))
    // 同时保存选择的模型，供仪表盘使用
    if (config.anthropicModel) {
      localStorage.setItem('anthropic_model', config.anthropicModel)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleClear = () => {
    if (confirm('确定要清除所有API配置吗？')) {
      localStorage.removeItem('apiConfig')
      setConfig({})
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">API 配置</h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          返回
        </button>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 text-green-800 rounded">
          ✓ 配置已保存
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Anthropic API 配置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={config.anthropicApiKey || ''}
                onChange={(e) => setConfig({ ...config, anthropicApiKey: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="sk-ant-..."
              />
              <p className="text-xs text-gray-500 mt-1">留空则使用服务器提供的免费API</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Base URL（可选）</label>
              <input
                type="text"
                value={config.anthropicBaseUrl || ''}
                onChange={(e) => setConfig({ ...config, anthropicBaseUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="https://api.anthropic.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">模型选择</label>
              <select
                value={config.anthropicModel || ''}
                onChange={(e) => setConfig({ ...config, anthropicModel: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">请选择模型</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.description}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetchingModels || !config.anthropicApiKey}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {fetchingModels ? '验证中...' : '🔄 验证API并获取模型'}
                </button>
                {fetchError && (
                  <span className="text-xs text-red-600">{fetchError}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">点击按钮验证API密钥并刷新模型列表</p>
            </div>
          </div>
        </div>
        <hr />
        <div>
          <h2 className="text-xl font-semibold mb-2">搜索 API 配置（可选）</h2>
          <p className="text-sm text-gray-600 mb-4">配置搜索API后，AI可以自动搜索相关信息</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tavily API Key</label>
              <input
                type="password"
                value={config.tavilyApiKey || ''}
                onChange={(e) => setConfig({ ...config, tavilyApiKey: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Serper API Key</label>
              <input
                type="password"
                value={config.serperApiKey || ''}
                onChange={(e) => setConfig({ ...config, serperApiKey: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存配置
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            清除配置
          </button>
        </div>
      </div>
    </div>
  )
}

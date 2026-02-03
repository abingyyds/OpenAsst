'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage, languages, Language } from '@/contexts/LanguageContext'

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

interface ServerApiStatus {
  hasDefaultApi: boolean
  defaultModel: string | null
  defaultBaseUrl: string | null
  message: string
}

export default function SettingsPage() {
  const router = useRouter()
  const { language, setLanguage } = useLanguage()
  const [config, setConfig] = useState<ApiConfig>({})
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [serverStatus, setServerStatus] = useState<ServerApiStatus | null>(null)

  useEffect(() => {
    // Fetch server API status
    fetch(`${API_BASE_URL}/api/config/status`)
      .then(res => res.json())
      .then(data => {
        setServerStatus(data)
      })
      .catch(err => {
        console.error('Failed to fetch server status:', err)
      })

    const savedConfig = localStorage.getItem('apiConfig')
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig)
      setConfig(parsedConfig)

      // Use saved config to fetch model list
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
              console.error('Failed to fetch models:', data.error)
            } else {
              console.log('Models fetched:', data)
              console.log('Model count:', data.length)
              setModels(data)
            }
          })
          .catch(err => {
            console.error('Failed to fetch models:', err)
          })
      } else {
        console.log('No API Key configured')
      }
    } else {
      console.log('No saved config found')
    }
  }, [])

  const handleFetchModels = async () => {
    if (!config.anthropicApiKey) {
      setFetchError('Please enter API Key first')
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
        throw new Error(data.error || 'Failed to fetch models')
      }

      setModels(data.models)

      // Show validation status
      if (data.validated) {
        setFetchError('✓ API key validated')
        setTimeout(() => setFetchError(''), 3000)
      } else {
        setFetchError('⚠️ ' + (data.message || 'API key not validated'))
      }
    } catch (error: any) {
      setFetchError('❌ ' + error.message)
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSave = () => {
    localStorage.setItem('apiConfig', JSON.stringify(config))
    // Also save selected model for dashboard use
    if (config.anthropicModel) {
      localStorage.setItem('anthropic_model', config.anthropicModel)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all API config?')) {
      localStorage.removeItem('apiConfig')
      setConfig({})
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">{'>'} Settings</h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 text-green-600 hover:text-green-400 font-mono"
        >
          &lt;- back
        </button>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-900/30 border border-green-500/50 text-green-400 rounded font-mono">
          [OK] config saved
        </div>
      )}

      <div className="terminal-card p-6 space-y-6">
        {/* Server API Status */}
        {serverStatus && (
          <div className={`p-4 rounded border ${serverStatus.hasDefaultApi ? 'bg-green-900/20 border-green-500/50' : 'bg-yellow-900/20 border-yellow-500/50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${serverStatus.hasDefaultApi ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
              <span className={`font-mono text-sm ${serverStatus.hasDefaultApi ? 'text-green-400' : 'text-yellow-400'}`}>
                {serverStatus.hasDefaultApi ? '[SERVER API READY]' : '[NO SERVER API]'}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono">{serverStatus.message}</p>
            {serverStatus.hasDefaultApi && (
              <p className="text-xs text-gray-500 font-mono mt-1">
                default_model: {serverStatus.defaultModel}
              </p>
            )}
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold mb-4 text-green-400 font-mono"># Anthropic API</h2>
          {/* Ad Banner */}
          <div className="mb-4 p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg">
            <p className="text-xs font-mono text-purple-300">
              <span className="text-yellow-400">*</span> Need cheap Claude Code Opus 4.5 API? Visit{' '}
              <a
                href="https://cCoder.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                cCoder.me
              </a>
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-green-500 mb-2">api_key:</label>
              <input
                type="password"
                value={config.anthropicApiKey || ''}
                onChange={(e) => setConfig({ ...config, anthropicApiKey: e.target.value })}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                placeholder="sk-ant-..."
              />
              <p className="text-xs text-gray-500 mt-1 font-mono">leave empty to use server-provided API</p>
            </div>
            <div>
              <label className="block text-sm font-mono text-green-500 mb-2">base_url: (optional)</label>
              <input
                type="text"
                value={config.anthropicBaseUrl || ''}
                onChange={(e) => setConfig({ ...config, anthropicBaseUrl: e.target.value })}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                placeholder="https://api.anthropic.com"
              />
            </div>
            <div>
              <label className="block text-sm font-mono text-green-500 mb-2">model:</label>
              <select
                value={config.anthropicModel || ''}
                onChange={(e) => setConfig({ ...config, anthropicModel: e.target.value })}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
              >
                <option value="">-- select model --</option>
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
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed font-mono"
                >
                  {fetchingModels ? 'validating...' : '> validate_api'}
                </button>
                {fetchError && (
                  <span className={`text-xs font-mono ${fetchError.startsWith('[OK]') || fetchError.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{fetchError}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 font-mono">click to validate API key and fetch models</p>
            </div>
          </div>
        </div>
        <hr className="border-green-900/30" />
        <div>
          <h2 className="text-xl font-semibold mb-2 text-green-400 font-mono"># Search API (optional)</h2>
          <p className="text-sm text-gray-500 mb-4 font-mono">enable AI to search for information</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-green-500 mb-2">tavily_api_key:</label>
              <input
                type="password"
                value={config.tavilyApiKey || ''}
                onChange={(e) => setConfig({ ...config, tavilyApiKey: e.target.value })}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-mono text-green-500 mb-2">serper_api_key:</label>
              <input
                type="password"
                value={config.serperApiKey || ''}
                onChange={(e) => setConfig({ ...config, serperApiKey: e.target.value })}
                className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
              />
            </div>
          </div>
        </div>
        <hr className="border-green-900/30" />
        <div>
          <h2 className="text-xl font-semibold mb-2 text-green-400 font-mono"># AI Language</h2>
          <p className="text-sm text-gray-500 mb-4 font-mono">select the language for AI responses</p>
          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">language:</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
          >
            {'>'} save_config
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-3 border border-red-500/50 text-red-400 rounded hover:bg-red-900/20 font-mono"
          >
            x clear
          </button>
        </div>
      </div>
    </div>
  )
}

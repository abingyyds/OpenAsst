'use client'

import { useState, useEffect } from 'react'
import { scriptApi, ScriptTemplate, ScriptExecutionResult } from '@/lib/api/scripts'
import { serverApi, Server } from '@/lib/api/servers'

interface UseScriptModalProps {
  script: ScriptTemplate | null
  isOpen: boolean
  onClose: () => void
}

export default function UseScriptModal({ script, isOpen, onClose }: UseScriptModalProps) {
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [parameters, setParameters] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<ScriptExecutionResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadServers()
      setResult(null)
      setError('')
    }
  }, [isOpen])

  const loadServers = async () => {
    setLoading(true)
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (err) {
      setError('加载服务器列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!selectedServerId) {
      setError('请选择服务器')
      return
    }

    setExecuting(true)
    setError('')

    try {
      const executionResult = await scriptApi.execute(script!.id, selectedServerId, parameters)
      setResult(executionResult)
    } catch (err) {
      setError('脚本执行失败，请稍后重试')
    } finally {
      setExecuting(false)
    }
  }

  if (!isOpen || !script) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">{script.name}</h2>
        <p className="text-gray-600 mb-6">{script.description}</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {!result ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">选择服务器</label>
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                disabled={loading || executing}
              >
                <option value="">请选择服务器</option>
                {servers.map(server => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.host})
                  </option>
                ))}
              </select>
            </div>

            {script.parameters && Object.keys(script.parameters).length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">参数配置</h3>
                {Object.entries(script.parameters).map(([key, param]: [string, any]) => (
                  <div key={key} className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                      {param.label || key}
                      {param.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={parameters[key] || ''}
                      onChange={(e) => setParameters({ ...parameters, [key]: e.target.value })}
                      placeholder={param.default || ''}
                      className="w-full px-3 py-2 border rounded"
                      disabled={executing}
                    />
                    {param.description && (
                      <p className="text-xs text-gray-500 mt-1">{param.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
                disabled={executing}
              >
                取消
              </button>
              <button
                onClick={handleExecute}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={executing || !selectedServerId}
              >
                {executing ? '执行中...' : '执行脚本'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="font-medium mb-2">执行结果</h3>
              <div className={`p-3 rounded ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.success ? '✓ 执行成功' : '✗ 执行失败'}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="font-medium mb-2">执行日志</h3>
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm max-h-64 overflow-y-auto">
                {result.logs.map((log, i) => (
                  <div key={i} className="mb-2">
                    <div className="text-blue-400">$ {log.command}</div>
                    <div className="whitespace-pre-wrap">{log.output}</div>
                  </div>
                ))}
              </div>
            </div>

            {result.aiSuggestions && result.aiSuggestions.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">💡 AI建议</h3>
                <div className="bg-blue-50 p-3 rounded text-sm">
                  {result.aiSuggestions.map((suggestion, i) => (
                    <p key={i} className="mb-2">{suggestion}</p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  )
}

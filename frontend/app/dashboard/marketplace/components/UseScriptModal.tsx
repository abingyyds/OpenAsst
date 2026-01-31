'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ScriptTemplate } from '@/lib/api/scripts'
import { serverApi, Server } from '@/lib/api/servers'

interface UseScriptModalProps {
  script: ScriptTemplate | null
  isOpen: boolean
  onClose: () => void
}

export default function UseScriptModal({ script, isOpen, onClose }: UseScriptModalProps) {
  const router = useRouter()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadServers()
      setError('')
    }
  }, [isOpen])

  const loadServers = async () => {
    setLoading(true)
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (err) {
      setError('Failed to load servers')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = () => {
    if (!selectedServerId) {
      setError('Please select a server')
      return
    }

    // Store full script data in sessionStorage for the server page to pick up
    sessionStorage.setItem('pendingScript', JSON.stringify({
      id: script!.id,
      name: script!.name,
      description: script!.description,
      documentContent: (script as any).documentContent,
      commands: script!.commands
    }))

    // Navigate to server page
    onClose()
    router.push(`/dashboard/servers/${selectedServerId}`)
  }

  if (!isOpen || !script) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="terminal-card p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4 text-green-400 font-mono"># {script.name}</h2>
        <p className="text-gray-500 mb-6 font-mono text-sm">{script.description}</p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
            [ERROR] {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-mono text-green-500 mb-2">target_server:</label>
          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
            disabled={loading}
          >
            <option value="">-- select server --</option>
            {servers.map(server => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.host})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-green-900/50 text-gray-400 rounded hover:bg-green-900/20 font-mono"
          >
            cancel
          </button>
          <button
            onClick={handleExecute}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 font-mono btn-glow"
            disabled={!selectedServerId || loading}
          >
            {'>'} go to server
          </button>
        </div>
      </div>
    </div>
  )
}

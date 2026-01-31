'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CreateScriptModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CreateScriptModal({ isOpen, onClose, onSuccess }: CreateScriptModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'custom' as 'deployment' | 'maintenance' | 'monitoring' | 'docker' | 'security' | 'backup' | 'network' | 'custom',
    tags: '',
    isPublic: true,
    documentContent: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userInfo, setUserInfo] = useState({ author: '', authorId: '' })

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserInfo({
        author: user?.email || 'Anonymous',
        authorId: user?.id || ''
      })
    }
    getUser()
  }, [])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 将标签字符串转换为数组
      const tagsArray = formData.tags
        .split(',')
        .filter(tag => tag.trim())
        .map(tag => tag.trim())

      const scriptData: any = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        tags: tagsArray,
        author: userInfo.author,
        authorId: userInfo.authorId,
        isPublic: formData.isPublic,
        documentContent: formData.documentContent,
        commands: []
      }

      const response = await fetch('http://localhost:3002/api/scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scriptData),
      })

      if (!response.ok) throw new Error('创建脚本失败')

      onSuccess()
      onClose()
      setFormData({
        name: '',
        description: '',
        category: 'custom',
        tags: '',
        isPublic: true,
        documentContent: ''
      })
    } catch (err) {
      setError('创建脚本失败，请检查信息后重试')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="terminal-card p-6 w-full max-w-2xl my-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-green-400 font-mono text-xl"
        >
          ×
        </button>
        <h2 className="text-2xl font-bold mb-4 text-green-400 font-mono"># Create Script</h2>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
            [ERROR] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">name:</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
              placeholder="e.g. deploy-nodejs-app"
            />
          </div>

          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">description:</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono h-20 focus:outline-none focus:border-green-500 placeholder-gray-600"
              placeholder="describe what this script does..."
            />
          </div>

          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">category:</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
            >
              <option value="deployment">deploy</option>
              <option value="maintenance">maintain</option>
              <option value="monitoring">monitor</option>
              <option value="docker">docker</option>
              <option value="security">security</option>
              <option value="backup">backup</option>
              <option value="network">network</option>
              <option value="custom">custom</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">document:</label>
            <textarea
              required
              value={formData.documentContent}
              onChange={(e) => setFormData({ ...formData, documentContent: e.target.value })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono text-sm h-48 focus:outline-none focus:border-green-500 placeholder-gray-600"
              placeholder="# Deploy Guide&#10;&#10;## Step 1: Setup&#10;npm install&#10;&#10;## Step 2: Build&#10;npm run build"
            />
            <p className="text-xs text-gray-600 mt-1 font-mono">
              AI will read document and execute operations accordingly
            </p>
          </div>

          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">tags: (comma separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
              placeholder="e.g. linux, deploy, automation"
            />
          </div>

          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">author:</label>
            <input
              type="text"
              value={userInfo.author}
              disabled
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-gray-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-4 h-4 accent-green-500"
            />
            <label htmlFor="isPublic" className="text-sm font-mono text-green-400">
              public (visible to other users)
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-green-900/50 text-gray-400 rounded hover:bg-green-900/20 font-mono"
              disabled={loading}
            >
              cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 font-mono btn-glow"
              disabled={loading}
            >
              {loading ? 'creating...' : '> create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

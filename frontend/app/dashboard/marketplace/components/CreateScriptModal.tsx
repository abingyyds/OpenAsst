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
    commands: '',
    tags: '',
    isPublic: true,
    mode: 'commands' as 'commands' | 'document',
    documentContent: '',
    documentType: 'markdown' as 'markdown' | 'text'
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
        isPublic: formData.isPublic
      }

      // 根据模式添加不同的内容
      if (formData.mode === 'document') {
        scriptData.documentContent = formData.documentContent
        scriptData.documentType = formData.documentType
        scriptData.commands = [] // 文档模式下命令为空数组
      } else {
        // 将命令字符串转换为数组
        const commandsArray = formData.commands
          .split('\n')
          .filter(cmd => cmd.trim())
          .map(cmd => cmd.trim())
        scriptData.commands = commandsArray
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
        commands: '',
        tags: '',
        isPublic: true,
        mode: 'commands',
        documentContent: '',
        documentType: 'markdown'
      })
    } catch (err) {
      setError('创建脚本失败，请检查信息后重试')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">创建脚本模板</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">脚本名称</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              placeholder="例如：部署Node.js应用"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded h-20"
              placeholder="描述这个脚本的功能..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">分类</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="deployment">部署</option>
              <option value="maintenance">维护</option>
              <option value="monitoring">监控</option>
              <option value="docker">Docker</option>
              <option value="security">安全</option>
              <option value="backup">备份</option>
              <option value="network">网络</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">内容模式</label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="commands"
                  checked={formData.mode === 'commands'}
                  onChange={(e) => setFormData({ ...formData, mode: 'commands' })}
                  className="w-4 h-4"
                />
                <span className="text-sm">命令模式</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="document"
                  checked={formData.mode === 'document'}
                  onChange={(e) => setFormData({ ...formData, mode: 'document' })}
                  className="w-4 h-4"
                />
                <span className="text-sm">文档模式</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              {formData.mode === 'commands'
                ? '命令模式：输入要执行的命令列表'
                : '文档模式：编写完整的操作文档，AI将读取并执行'}
            </p>
          </div>

          {formData.mode === 'commands' ? (
            <div>
              <label className="block text-sm font-medium mb-1">命令（每行一个）</label>
              <textarea
                required
                value={formData.commands}
                onChange={(e) => setFormData({ ...formData, commands: e.target.value })}
                className="w-full px-3 py-2 border rounded h-32 font-mono text-sm"
                placeholder="ls -la&#10;pwd&#10;echo 'Hello World'"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">文档内容</label>
                <select
                  value={formData.documentType}
                  onChange={(e) => setFormData({ ...formData, documentType: e.target.value as 'markdown' | 'text' })}
                  className="text-xs px-2 py-1 border rounded"
                >
                  <option value="markdown">Markdown</option>
                  <option value="text">纯文本</option>
                </select>
              </div>
              <textarea
                required
                value={formData.documentContent}
                onChange={(e) => setFormData({ ...formData, documentContent: e.target.value })}
                className="w-full px-3 py-2 border rounded h-64 font-mono text-sm"
                placeholder={formData.documentType === 'markdown'
                  ? "# 部署指南\n\n## 步骤1：准备环境\n\n```bash\nnpm install\n```\n\n## 步骤2：构建项目\n\n```bash\nnpm run build\n```"
                  : "部署指南\n\n步骤1：准备环境\nnpm install\n\n步骤2：构建项目\nnpm run build"}
              />
              <p className="text-xs text-gray-500 mt-1">
                AI将读取文档内容并根据描述执行相应操作
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">标签（用逗号分隔）</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              placeholder="例如：linux, 部署, 自动化"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">作者</label>
            <input
              type="text"
              value={userInfo.author}
              disabled
              className="w-full px-3 py-2 border rounded bg-gray-50 text-gray-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="isPublic" className="text-sm font-medium">
              公开脚本（其他用户可以看到和使用）
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

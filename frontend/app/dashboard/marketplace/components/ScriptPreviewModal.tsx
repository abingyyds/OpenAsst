'use client'

import { ScriptTemplate } from '@/lib/api/scripts'

interface ScriptPreviewModalProps {
  script: ScriptTemplate | null
  isOpen: boolean
  onClose: () => void
  onUse: () => void
}

export default function ScriptPreviewModal({ script, isOpen, onClose, onUse }: ScriptPreviewModalProps) {
  if (!isOpen || !script) return null

  // Detect dangerous commands
  const dangerousKeywords = ['rm -rf', 'dd if=', 'mkfs', ':(){:|:&};:', 'chmod 777', '> /dev/sda']
  const hasDangerousCommands = script.commands?.some(cmd =>
    dangerousKeywords.some(keyword => cmd.includes(keyword))
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{script.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <p className="text-gray-600 mb-4">{script.description}</p>

        {/* Author and metadata */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          {script.author && (
            <div>
              <span className="text-gray-500">作者：</span>
              <span className="font-medium">{script.author}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">分类：</span>
            <span className="font-medium">{script.category || 'custom'}</span>
          </div>
          <div>
            <span className="text-gray-500">点赞数：</span>
            <span className="font-medium">❤️ {script.likeCount || 0}</span>
          </div>
          <div>
            <span className="text-gray-500">使用次数：</span>
            <span className="font-medium">🔄 {script.usageCount || script.usage_count || 0}</span>
          </div>
        </div>

        {/* Tags */}
        {script.tags && script.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">标签</h3>
            <div className="flex gap-2 flex-wrap">
              {script.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Danger warning */}
        {hasDangerousCommands && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
            <div className="flex items-start gap-2">
              <span className="text-red-600 text-xl">⚠️</span>
              <div>
                <h3 className="text-red-800 font-semibold">危险警告</h3>
                <p className="text-red-700 text-sm mt-1">
                  此脚本包含可能危险的命令，执行前请仔细检查并确保您了解其作用。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content: Commands or Document */}
        <div className="mb-6">
          {script.documentContent ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">文档内容</h3>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                  {script.documentType === 'markdown' ? 'Markdown' : '纯文本'}
                </span>
              </div>
              <div className="bg-gray-50 border border-gray-200 p-4 rounded text-sm overflow-x-auto max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-xs">{script.documentContent}</pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 AI将读取此文档并根据内容执行相应操作
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-gray-700 mb-2">命令列表</h3>
              <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm overflow-x-auto">
                {script.commands && script.commands.length > 0 ? (
                  script.commands.map((cmd, index) => (
                    <div key={index} className="mb-2 last:mb-0">
                      <span className="text-gray-500">$ </span>
                      <span>{cmd}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">无命令</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            onClick={() => {
              onUse()
              onClose()
            }}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            使用此脚本
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const hasDangerousCommands = script.commands?.some((cmd: string) =>
    dangerousKeywords.some(keyword => cmd.includes(keyword))
  )

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="terminal-card p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-green-400 font-mono"># {script.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-green-400 text-2xl font-mono"
          >
            x
          </button>
        </div>

        <p className="text-gray-500 mb-4 font-mono">{script.description}</p>

        {/* Author and metadata */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm font-mono">
          {script.author && (
            <div>
              <span className="text-gray-600">author: </span>
              <span className="text-green-400">{script.author}</span>
            </div>
          )}
          <div>
            <span className="text-gray-600">category: </span>
            <span className="text-green-400">{script.category || 'custom'}</span>
          </div>
          <div>
            <span className="text-gray-600">likes: </span>
            <span className="text-green-400">+{script.likeCount || 0}</span>
          </div>
          <div>
            <span className="text-gray-600">usage: </span>
            <span className="text-green-400">x{script.usageCount || script.usage_count || 0}</span>
          </div>
        </div>

        {/* Tags */}
        {script.tags && script.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-mono text-green-500 mb-2"># tags</h3>
            <div className="flex gap-2 flex-wrap">
              {script.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded font-mono">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Danger warning */}
        {hasDangerousCommands && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded">
            <div className="flex items-start gap-2">
              <span className="text-red-400 text-xl font-mono">[!]</span>
              <div>
                <h3 className="text-red-400 font-semibold font-mono">DANGER WARNING</h3>
                <p className="text-red-300 text-sm mt-1 font-mono">
                  This script contains potentially dangerous commands. Review carefully before execution.
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
                <h3 className="text-sm font-mono text-green-500"># document</h3>
                <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded font-mono">
                  {script.documentType === 'markdown' ? 'markdown' : 'plain_text'}
                </span>
              </div>
              <div className="bg-[#0a0f0d] border border-green-900/50 p-4 rounded text-sm overflow-x-auto max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-xs text-green-300">{script.documentContent}</pre>
              </div>
              <p className="text-xs text-gray-600 mt-2 font-mono">
                AI will read this document and execute operations accordingly
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-mono text-green-500 mb-2"># commands</h3>
              <div className="bg-[#0a0f0d] border border-green-900/50 text-green-300 p-4 rounded font-mono text-sm overflow-x-auto">
                {script.commands && script.commands.length > 0 ? (
                  script.commands.map((cmd, index) => (
                    <div key={index} className="mb-2 last:mb-0">
                      <span className="text-gray-600">$ </span>
                      <span className="text-[#00ff41]">{cmd}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-600">no commands</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-green-900/50 text-gray-400 rounded hover:bg-green-900/20 font-mono"
          >
            close
          </button>
          <button
            onClick={() => {
              onUse()
              onClose()
            }}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
          >
            {'>'} use_script
          </button>
        </div>
      </div>
    </div>
  )
}

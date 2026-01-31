'use client'

import { useState, useEffect, useRef } from 'react'
import { scriptApi, ScriptTemplate } from '@/lib/api/scripts'
import UseScriptModal from './components/UseScriptModal'
import CreateScriptModal from './components/CreateScriptModal'
import ScriptPreviewModal from './components/ScriptPreviewModal'
import { supabase } from '@/lib/supabase'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export default function MarketplacePage() {
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [scripts, setScripts] = useState<ScriptTemplate[]>([])
  const [filteredScripts, setFilteredScripts] = useState<ScriptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedScript, setSelectedScript] = useState<ScriptTemplate | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [likedScripts, setLikedScripts] = useState<Set<string>>(new Set())
  const [favoritedScripts, setFavoritedScripts] = useState<Set<string>>(new Set())
  const [scriptRatings, setScriptRatings] = useState<Map<string, {average: number, count: number, userRating: number | null}>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id || null)
    }
    getUser()
  }, [])

  useEffect(() => {
    loadScripts()
  }, [category, sortBy])

  useEffect(() => {
    // Filter scripts based on search query
    if (!searchQuery.trim()) {
      setFilteredScripts(scripts)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = scripts.filter(script => {
      const nameMatch = script.name.toLowerCase().includes(query)
      const descMatch = script.description.toLowerCase().includes(query)
      const authorMatch = script.author?.toLowerCase().includes(query)
      const tagsMatch = script.tags?.some(tag => tag.toLowerCase().includes(query))

      return nameMatch || descMatch || authorMatch || tagsMatch
    })

    setFilteredScripts(filtered)
  }, [searchQuery, scripts])

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrlKey: true,
      metaKey: true,
      callback: () => searchInputRef.current?.focus(),
      description: '快速搜索'
    },
    {
      key: 'Escape',
      callback: () => {
        if (isModalOpen) setIsModalOpen(false)
        if (isPreviewModalOpen) setIsPreviewModalOpen(false)
        if (isCreateModalOpen) setIsCreateModalOpen(false)
      },
      description: '关闭弹窗'
    }
  ])

  const loadScripts = async () => {
    try {
      const data = await scriptApi.getAll(sortBy, category === 'mine' ? 'all' : category)

      // Filter by user's own scripts if category is 'mine'
      const filteredData = category === 'mine' && userId
        ? data.filter(script => script.authorId === userId)
        : data

      setScripts(filteredData)
      setFilteredScripts(filteredData)

      // Load liked status for each script
      if (userId) {
        const liked = new Set<string>()
        for (const script of data) {
          try {
            const likeInfo = await scriptApi.getLikes(script.id, userId)
            if (likeInfo.userHasLiked) {
              liked.add(script.id)
            }
          } catch (error) {
            console.error('Failed to load like status:', error)
          }
        }
        setLikedScripts(liked)

        // Load favorite status
        try {
          const favorites = await scriptApi.getFavorites(userId)
          const favoriteIds = new Set(favorites.map(f => f.id))
          setFavoritedScripts(favoriteIds)
        } catch (error) {
          console.error('Failed to load favorites:', error)
        }

        // Load rating info for each script
        const ratings = new Map()
        for (const script of data) {
          try {
            const ratingInfo = await scriptApi.getRating(script.id, userId)
            ratings.set(script.id, ratingInfo)
          } catch (error) {
            console.error('Failed to load rating:', error)
          }
        }
        setScriptRatings(ratings)
      }
    } catch (error) {
      console.error('加载脚本失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (scriptId: string) => {
    if (!userId) {
      alert('请先登录')
      return
    }

    const isLiked = likedScripts.has(scriptId)
    const script = scripts.find(s => s.id === scriptId)
    if (!script) return

    // Optimistic update
    const newLikedScripts = new Set(likedScripts)
    if (isLiked) {
      newLikedScripts.delete(scriptId)
    } else {
      newLikedScripts.add(scriptId)
    }
    setLikedScripts(newLikedScripts)

    const newLikeCount = (script.likeCount || 0) + (isLiked ? -1 : 1)
    setScripts(scripts.map(s =>
      s.id === scriptId ? { ...s, likeCount: newLikeCount } : s
    ))

    try {
      if (isLiked) {
        await scriptApi.unlike(scriptId, userId)
      } else {
        await scriptApi.like(scriptId, userId)
      }
    } catch (error) {
      // Revert on error
      setLikedScripts(likedScripts)
      setScripts(scripts.map(s =>
        s.id === scriptId ? { ...s, likeCount: script.likeCount } : s
      ))
      console.error('点赞操作失败:', error)
    }
  }

  const handleDelete = async (scriptId: string) => {
    if (!userId) {
      alert('请先登录')
      return
    }

    if (!confirm('确定要删除这个脚本吗？此操作无法撤销。')) {
      return
    }

    try {
      await scriptApi.delete(scriptId, userId)
      // Remove from list
      setScripts(scripts.filter(s => s.id !== scriptId))
      alert('脚本已删除')
    } catch (error) {
      console.error('删除脚本失败:', error)
      alert('删除失败: ' + (error as Error).message)
    }
  }

  const handleFavorite = async (scriptId: string) => {
    if (!userId) {
      alert('请先登录')
      return
    }

    const isFavorited = favoritedScripts.has(scriptId)

    // Optimistic update
    const newFavorites = new Set(favoritedScripts)
    if (isFavorited) {
      newFavorites.delete(scriptId)
    } else {
      newFavorites.add(scriptId)
    }
    setFavoritedScripts(newFavorites)

    try {
      if (isFavorited) {
        await scriptApi.unfavorite(scriptId, userId)
      } else {
        await scriptApi.favorite(scriptId, userId)
      }
    } catch (error) {
      // Revert on error
      setFavoritedScripts(favoritedScripts)
      console.error('收藏操作失败:', error)
    }
  }

  const handleRate = async (scriptId: string, rating: number) => {
    if (!userId) {
      alert('请先登录')
      return
    }

    // Optimistic update
    const currentRating = scriptRatings.get(scriptId)
    const newRatings = new Map(scriptRatings)
    newRatings.set(scriptId, {
      average: currentRating?.average || rating,
      count: currentRating?.count || 1,
      userRating: rating
    })
    setScriptRatings(newRatings)

    try {
      const result = await scriptApi.rate(scriptId, userId, rating)
      // Update with actual values from server
      newRatings.set(scriptId, {
        average: result.average,
        count: result.count,
        userRating: result.userRating
      })
      setScriptRatings(newRatings)
    } catch (error) {
      // Revert on error
      setScriptRatings(scriptRatings)
      console.error('评分操作失败:', error)
    }
  }

  if (loading) {
    return <div className="text-center py-12">加载中...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">命令市场</h1>
        <div className="flex gap-3">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜索脚本、标签或作者... (Ctrl+K)"
            className="px-4 py-2 border border-gray-300 rounded w-64"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded bg-white"
          >
            <option value="recent">最新</option>
            <option value="likes">最多点赞</option>
            <option value="usage">最多使用</option>
          </select>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            创建脚本
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategory('all')}
          className={`px-4 py-2 rounded ${category === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          全部
        </button>
        <button
          onClick={() => setCategory('mine')}
          className={`px-4 py-2 rounded ${category === 'mine' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          我的脚本
        </button>
        <button
          onClick={() => setCategory('deployment')}
          className={`px-4 py-2 rounded ${category === 'deployment' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          部署
        </button>
        <button
          onClick={() => setCategory('maintenance')}
          className={`px-4 py-2 rounded ${category === 'maintenance' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          维护
        </button>
        <button
          onClick={() => setCategory('monitoring')}
          className={`px-4 py-2 rounded ${category === 'monitoring' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          监控
        </button>
        <button
          onClick={() => setCategory('docker')}
          className={`px-4 py-2 rounded ${category === 'docker' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          Docker
        </button>
        <button
          onClick={() => setCategory('security')}
          className={`px-4 py-2 rounded ${category === 'security' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          安全
        </button>
        <button
          onClick={() => setCategory('backup')}
          className={`px-4 py-2 rounded ${category === 'backup' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          备份
        </button>
        <button
          onClick={() => setCategory('network')}
          className={`px-4 py-2 rounded ${category === 'network' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}
        >
          网络
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredScripts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            {searchQuery ? '没有找到匹配的脚本' : '暂无脚本'}
          </div>
        ) : (
          filteredScripts.map(script => (
          <div key={script.id} className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-bold">{script.name}</h3>
                {userId && script.authorId === userId && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                    我的脚本
                  </span>
                )}
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-3">{script.description}</p>

            {script.author && (
              <p className="text-xs text-gray-500 mb-3">
                作者: {script.author}
              </p>
            )}

            <div className="flex gap-2 flex-wrap mb-4">
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                {script.category || 'custom'}
              </span>
              {script.documentContent && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                  📄 {script.documentType === 'markdown' ? 'Markdown' : '文档'}
                </span>
              )}
              {script.tags && script.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
              <span>❤️ {script.likeCount || 0}</span>
              <span>🔄 {script.usageCount || script.usage_count || 0}</span>
            </div>

            {/* Rating Display and Input */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => {
                  const ratingInfo = scriptRatings.get(script.id)
                  const userRating = ratingInfo?.userRating || 0
                  const avgRating = ratingInfo?.average || 0
                  const isFilled = star <= (userRating || avgRating)

                  return (
                    <button
                      key={star}
                      onClick={() => handleRate(script.id, star)}
                      className="text-xl hover:scale-110 transition-transform"
                      title={`评分 ${star} 星`}
                    >
                      {isFilled ? '⭐' : '☆'}
                    </button>
                  )
                })}
              </div>
              <span className="text-sm text-gray-600">
                {scriptRatings.get(script.id)?.average.toFixed(1) || '0.0'}
                ({scriptRatings.get(script.id)?.count || 0})
              </span>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => handleLike(script.id)}
                className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                  likedScripts.has(script.id)
                    ? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {likedScripts.has(script.id) ? '❤️ 已点赞' : '🤍 点赞'}
              </button>
              <button
                onClick={() => handleFavorite(script.id)}
                className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                  favoritedScripts.has(script.id)
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-600 hover:bg-yellow-100'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {favoritedScripts.has(script.id) ? '⭐ 已收藏' : '☆ 收藏'}
              </button>
              <button
                onClick={() => {
                  setSelectedScript(script)
                  setIsPreviewModalOpen(true)
                }}
                className="flex-1 px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
              >
                👁️ 预览
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedScript(script)
                  setIsModalOpen(true)
                }}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                使用
              </button>
              {userId && script.authorId === userId && (
                <button
                  onClick={() => handleDelete(script.id)}
                  className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  title="删除脚本"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))
        )}
      </div>

      <UseScriptModal
        script={selectedScript}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedScript(null)
        }}
      />

      <ScriptPreviewModal
        script={selectedScript}
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false)
          setSelectedScript(null)
        }}
        onUse={() => {
          setIsPreviewModalOpen(false)
          setIsModalOpen(true)
        }}
      />

      <CreateScriptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadScripts()
          setIsCreateModalOpen(false)
        }}
      />
    </div>
  )
}

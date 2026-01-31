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
    return <div className="text-center py-12 text-green-500 font-mono">loading scripts...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">{'>'} Marketplace</h1>
        <div className="flex gap-3">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="search scripts... (Ctrl+K)"
            className="px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded w-64 text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-400 font-mono focus:outline-none focus:border-green-500"
          >
            <option value="recent">recent</option>
            <option value="likes">most liked</option>
            <option value="usage">most used</option>
          </select>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
          >
            + create
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategory('all')}
          className={`px-4 py-2 rounded font-mono ${category === 'all' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          all
        </button>
        <button
          onClick={() => setCategory('mine')}
          className={`px-4 py-2 rounded font-mono ${category === 'mine' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          my_scripts
        </button>
        <button
          onClick={() => setCategory('deployment')}
          className={`px-4 py-2 rounded font-mono ${category === 'deployment' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          deploy
        </button>
        <button
          onClick={() => setCategory('maintenance')}
          className={`px-4 py-2 rounded font-mono ${category === 'maintenance' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          maintain
        </button>
        <button
          onClick={() => setCategory('monitoring')}
          className={`px-4 py-2 rounded font-mono ${category === 'monitoring' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          monitor
        </button>
        <button
          onClick={() => setCategory('docker')}
          className={`px-4 py-2 rounded font-mono ${category === 'docker' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          docker
        </button>
        <button
          onClick={() => setCategory('security')}
          className={`px-4 py-2 rounded font-mono ${category === 'security' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          security
        </button>
        <button
          onClick={() => setCategory('backup')}
          className={`px-4 py-2 rounded font-mono ${category === 'backup' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          backup
        </button>
        <button
          onClick={() => setCategory('network')}
          className={`px-4 py-2 rounded font-mono ${category === 'network' ? 'bg-green-600 text-white' : 'border border-green-900/50 text-green-400 hover:bg-green-900/20'}`}
        >
          network
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredScripts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 font-mono">
            {searchQuery ? 'no matching scripts' : 'no scripts found'}
          </div>
        ) : (
          filteredScripts.map(script => (
          <div key={script.id} className="terminal-card p-6 hover:border-green-500/50 transition">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-bold text-green-400 font-mono">{script.name}</h3>
                {userId && script.authorId === userId && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-green-900/30 text-green-500 text-xs rounded font-mono">
                    mine
                  </span>
                )}
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-3">{script.description}</p>

            {script.author && (
              <p className="text-xs text-gray-600 mb-3 font-mono">
                by: {script.author}
              </p>
            )}

            <div className="flex gap-2 flex-wrap mb-4">
              <span className="px-2 py-1 bg-green-900/30 text-green-500 text-xs rounded font-mono">
                {script.category || 'custom'}
              </span>
              {script.documentContent && (
                <span className="px-2 py-1 bg-emerald-900/30 text-emerald-400 text-xs rounded font-mono">
                  {script.documentType === 'markdown' ? 'md' : 'doc'}
                </span>
              )}
              {script.tags && script.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-green-900/20 text-green-600 text-xs rounded font-mono">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4 font-mono">
              <span>+{script.likeCount || 0}</span>
              <span>x{script.usageCount || script.usage_count || 0}</span>
            </div>

            {/* Rating Display */}
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
                      className={`text-lg hover:scale-110 transition-transform ${isFilled ? 'text-green-400' : 'text-gray-600'}`}
                      title={`Rate ${star}`}
                    >
                      {isFilled ? '*' : '.'}
                    </button>
                  )
                })}
              </div>
              <span className="text-sm text-gray-500 font-mono">
                {scriptRatings.get(script.id)?.average.toFixed(1) || '0.0'}
                ({scriptRatings.get(script.id)?.count || 0})
              </span>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => handleLike(script.id)}
                className={`flex-1 px-3 py-2 text-sm rounded border font-mono transition ${
                  likedScripts.has(script.id)
                    ? 'bg-green-900/30 border-green-500/50 text-green-400'
                    : 'border-green-900/50 text-gray-500 hover:text-green-400'
                }`}
              >
                {likedScripts.has(script.id) ? '+1' : 'like'}
              </button>
              <button
                onClick={() => handleFavorite(script.id)}
                className={`flex-1 px-3 py-2 text-sm rounded border font-mono transition ${
                  favoritedScripts.has(script.id)
                    ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-400'
                    : 'border-green-900/50 text-gray-500 hover:text-yellow-400'
                }`}
              >
                {favoritedScripts.has(script.id) ? 'saved' : 'save'}
              </button>
              <button
                onClick={() => {
                  setSelectedScript(script)
                  setIsPreviewModalOpen(true)
                }}
                className="flex-1 px-3 py-2 border border-green-900/50 text-gray-400 text-sm rounded hover:text-green-400 font-mono"
              >
                view
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedScript(script)
                  setIsModalOpen(true)
                }}
                className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-500 font-mono btn-glow"
              >
                {'>'} use
              </button>
              {userId && script.authorId === userId && (
                <button
                  onClick={() => handleDelete(script.id)}
                  className="px-3 py-2 bg-red-900/50 text-red-400 text-sm rounded hover:bg-red-800 font-mono"
                  title="Delete"
                >
                  x
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

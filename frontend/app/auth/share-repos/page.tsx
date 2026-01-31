'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string
  html_url: string
  stargazers_count: number
  language: string
  selected?: boolean
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export default function ShareReposPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      // Check if this is first login
      const isFirstLogin = localStorage.getItem('github_first_login')
      if (!isFirstLogin) {
        router.push('/dashboard')
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      // Fetch user's public repos
      await fetchRepos(user)
    }

    init()
  }, [router])

  const fetchRepos = async (user: any) => {
    try {
      const githubUsername = user.user_metadata?.user_name
      if (!githubUsername) {
        setError('Could not get GitHub username')
        setLoading(false)
        return
      }

      const response = await fetch(
        `https://api.github.com/users/${githubUsername}/repos?type=public&sort=stars&per_page=30`
      )

      if (!response.ok) throw new Error('Failed to fetch repos')

      const data = await response.json()
      setRepos(data.map((repo: GitHubRepo) => ({ ...repo, selected: false })))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleRepo = (repoId: number) => {
    setRepos(repos.map(repo =>
      repo.id === repoId ? { ...repo, selected: !repo.selected } : repo
    ))
  }

  const selectAll = () => {
    setRepos(repos.map(repo => ({ ...repo, selected: true })))
  }

  const deselectAll = () => {
    setRepos(repos.map(repo => ({ ...repo, selected: false })))
  }

  const handleSubmit = async () => {
    const selectedRepos = repos.filter(repo => repo.selected)

    if (selectedRepos.length === 0) {
      // Skip sharing
      localStorage.removeItem('github_first_login')
      router.push('/dashboard')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Send selected repos to backend to fetch READMEs and store in knowledge base
      const response = await fetch(`${API_BASE_URL}/api/github/import-readmes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          repos: selectedRepos.map(repo => ({
            full_name: repo.full_name,
            name: repo.name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count
          })),
          username: user.user_metadata?.user_name
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to import READMEs')
      }

      const result = await response.json()
      console.log('Import result:', result)

      localStorage.removeItem('github_first_login')
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = () => {
    localStorage.removeItem('github_first_login')
    router.push('/dashboard')
  }

  const selectedCount = repos.filter(r => r.selected).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f0d]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Loading your repositories...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f0d] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="terminal-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-4 text-green-500/70 text-sm font-mono">share-repos</span>
          </div>

          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-2">
              Welcome to <span className="text-green-400">OpenAsst</span>!
            </h1>
            <p className="text-gray-400 mb-6">
              Would you like to share your public repositories' README files to help improve our knowledge base?
              This helps the AI assistant learn from real-world projects.
            </p>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <span className="text-green-400 font-mono text-sm">
                {selectedCount} of {repos.length} selected
              </span>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-green-400 hover:text-green-300 font-mono">
                  Select All
                </button>
                <span className="text-gray-600">|</span>
                <button onClick={deselectAll} className="text-xs text-gray-400 hover:text-gray-300 font-mono">
                  Deselect All
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 mb-6">
              {repos.map(repo => (
                <div
                  key={repo.id}
                  onClick={() => toggleRepo(repo.id)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    repo.selected
                      ? 'border-green-500 bg-green-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={repo.selected}
                        onChange={() => {}}
                        className="w-4 h-4 accent-green-500"
                      />
                      <div>
                        <p className="text-white font-mono text-sm">{repo.name}</p>
                        <p className="text-gray-500 text-xs truncate max-w-md">
                          {repo.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {repo.language && <span>{repo.language}</span>}
                      <span>⭐ {repo.stargazers_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                disabled={submitting}
                className="flex-1 py-3 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-800 transition-all font-mono"
              >
                Skip for now
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all font-mono disabled:opacity-50"
              >
                {submitting ? 'Sharing...' : `Share ${selectedCount} repos`}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Only public repository READMEs will be shared.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
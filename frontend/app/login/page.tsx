'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [githubLoading, setGithubLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGitHubLogin = async () => {
    setGithubLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'read:user public_repo'
        }
      })

      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'GitHub login failed')
      setGithubLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f0d] grid-pattern">
      <div className="w-full max-w-md px-6">
        {/* Terminal Header */}
        <div className="terminal-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-4 text-green-500/70 text-sm font-mono">auth@openasst ~ login</span>
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold">
                <span className="text-white">Open</span>
                <span className="text-[#00ff41] glow-text">Asst</span>
              </h1>
              <p className="text-green-500/70 font-mono text-sm mt-2">$ authenticate --user</p>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
                [ERROR] {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-green-400 text-sm font-mono mb-2">email:</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded-lg text-green-100 font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-green-400 text-sm font-mono mb-2">password:</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded-lg text-green-100 font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg btn-glow hover:from-green-500 hover:to-emerald-500 transition-all duration-300 disabled:opacity-50 font-mono"
              >
                {loading ? '> connecting...' : '> login'}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-green-900/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#0d1117] text-gray-500 font-mono">or</span>
              </div>
            </div>

            <button
              onClick={handleGitHubLogin}
              disabled={githubLoading}
              className="w-full py-3 bg-[#24292e] hover:bg-[#2f363d] text-white font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 font-mono flex items-center justify-center gap-3 border border-gray-700"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {githubLoading ? 'Connecting...' : 'Continue with GitHub'}
            </button>

            <p className="text-center text-gray-500 mt-6 font-mono text-sm">
              No account?{' '}
              <Link href="/register" className="text-green-400 hover:text-green-300 hover:underline">
                register
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="text-green-600 hover:text-green-400 font-mono text-sm">
            &lt;- back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

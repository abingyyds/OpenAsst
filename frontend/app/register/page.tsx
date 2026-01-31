'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (password.length < 6) {
      setError('密码长度至少为6位')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) throw error
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f0d] grid-pattern">
      <div className="w-full max-w-md px-6">
        <div className="terminal-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-green-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-4 text-green-500/70 text-sm font-mono">auth@openasst ~ register</span>
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold">
                <span className="text-white">Open</span>
                <span className="text-[#00ff41] glow-text">Asst</span>
              </h1>
              <p className="text-green-500/70 font-mono text-sm mt-2">$ create --new-user</p>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
                [ERROR] {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-5">
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
                  placeholder="至少6位"
                />
              </div>

              <div>
                <label className="block text-green-400 text-sm font-mono mb-2">confirm_password:</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a0f0d] border border-green-900/50 rounded-lg text-green-100 font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600"
                  placeholder="再次输入密码"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg btn-glow hover:from-green-500 hover:to-emerald-500 transition-all duration-300 disabled:opacity-50 font-mono"
              >
                {loading ? '> creating...' : '> register'}
              </button>
            </form>

            <p className="text-center text-gray-500 mt-6 font-mono text-sm">
              Already have account?{' '}
              <Link href="/login" className="text-green-400 hover:text-green-300 hover:underline">
                login
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

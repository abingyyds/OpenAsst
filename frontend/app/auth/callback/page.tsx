'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing login...')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get session from URL hash
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) throw error

        if (session) {
          const user = session.user
          const isGitHubUser = user.app_metadata?.provider === 'github'

          // Check if first login (created_at close to last_sign_in_at)
          const createdAt = new Date(user.created_at).getTime()
          const lastSignIn = new Date(user.last_sign_in_at || user.created_at).getTime()
          const isFirstLogin = Math.abs(lastSignIn - createdAt) < 60000 // Within 1 minute

          if (isGitHubUser && isFirstLogin) {
            // First GitHub login - redirect to share repos page
            setStatus('First login detected, redirecting...')
            localStorage.setItem('github_first_login', 'true')
            localStorage.setItem('github_access_token', session.provider_token || '')
            router.push('/auth/share-repos')
          } else {
            // Regular login
            setStatus('Login successful!')
            router.push('/dashboard')
          }
        } else {
          throw new Error('No session found')
        }
      } catch (err: any) {
        console.error('Auth callback error:', err)
        setStatus('Login failed: ' + err.message)
        setTimeout(() => router.push('/login'), 2000)
      }
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f0d]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-green-400 font-mono">{status}</p>
      </div>
    </div>
  )
}

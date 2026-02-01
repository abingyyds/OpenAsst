'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import NotificationContainer from '@/components/NotificationContainer'

const navItems = [
  { href: '/dashboard', icon: '>', label: 'Dashboard' },
  { href: '/dashboard/servers', icon: '#', label: 'Servers' },
  { href: '/dashboard/batch', icon: '&', label: 'Batch Control' },
  { href: '/dashboard/marketplace', icon: '$', label: 'Marketplace' },
  { href: '/dashboard/cli-setup', icon: '@', label: 'CLI Setup' },
  { href: '/dashboard/settings', icon: '*', label: 'Settings' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <LanguageProvider>
      <NotificationProvider>
        <ThemeProvider>
          <div className="flex h-screen bg-[#0a0f0d]">
            {/* Sidebar */}
            <aside className="w-64 bg-[#0d1512] border-r border-green-900/30 flex flex-col">
              <div className="p-6 border-b border-green-900/30">
                <Link href="/dashboard" className="block">
                  <h1 className="text-2xl font-bold">
                    <span className="text-white">Open</span>
                    <span className="text-[#00ff41] glow-text">Asst</span>
                  </h1>
                </Link>
                <p className="text-green-600 text-xs font-mono mt-2">v1.0.0 • online</p>
              </div>

            <nav className="flex-1 py-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-6 py-3 font-mono text-sm transition-all ${
                      isActive
                        ? 'text-[#00ff41] bg-green-900/20 border-r-2 border-green-500'
                        : 'text-gray-400 hover:text-green-400 hover:bg-green-900/10'
                    }`}
                  >
                    <span className={isActive ? 'text-green-500' : 'text-green-700'}>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div className="p-4 border-t border-green-900/30">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-gray-500 hover:text-red-400 hover:bg-red-900/10 rounded font-mono text-sm transition-all"
              >
                {'>'} logout
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-8 grid-pattern">
            {children}
          </main>
        </div>
        <NotificationContainer />
        </ThemeProvider>
      </NotificationProvider>
    </LanguageProvider>
  )
}

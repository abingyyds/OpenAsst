'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ThemeProvider } from '@/contexts/ThemeContext'
import ThemeToggle from '@/components/ThemeToggle'
import { NotificationProvider } from '@/contexts/NotificationContext'
import NotificationContainer from '@/components/NotificationContainer'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <NotificationProvider>
      <ThemeProvider>
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
          {/* 侧边栏 */}
          <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg flex flex-col">
            <div className="p-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">OpenAsst</h1>
              <ThemeToggle />
            </div>
            <nav className="mt-6 flex-1">
              <Link href="/dashboard" className="block px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700">
                📊 仪表板
              </Link>
              <Link href="/dashboard/servers" className="block px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700">
                🔌 连接管理
              </Link>
              <Link href="/dashboard/marketplace" className="block px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700">
                🛒 命令市场
              </Link>
              <Link href="/dashboard/cli-setup" className="block px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700">
                🖥️ CLI工具
              </Link>
              <Link href="/dashboard/settings" className="block px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700">
                ⚙️ API设置
              </Link>
            </nav>
            <div className="p-6 border-t dark:border-gray-700">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-600 dark:hover:text-red-400 rounded"
              >
                🚪 登出
              </button>
            </div>
          </aside>

          {/* 主内容区 */}
          <main className="flex-1 overflow-auto p-8 dark:text-gray-100">
            {children}
          </main>
        </div>
        <NotificationContainer />
      </ThemeProvider>
    </NotificationProvider>
  )
}

import { supabase } from '../supabase'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// 获取当前用户ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch {
    return null
  }
}

export interface CommandExecutionResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
  aiSuggestion?: string
}

export const commandApi = {
  async execute(serverId: string, command: string, timeout?: number): Promise<CommandExecutionResult> {
    const userId = await getCurrentUserId()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userId) headers['X-User-Id'] = userId

    const controller = new AbortController()
    const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null

    try {
      const response = await fetch(`${API_BASE_URL}/api/servers/${serverId}/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, timeout }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error('命令执行失败')
      }

      return response.json()
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }
}

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
  },

  // 流式执行命令，实时返回输出
  async executeStream(
    serverId: string,
    command: string,
    onOutput: (data: string) => void,
    onError: (error: string) => void,
    onDone: (exitCode: number) => void,
    timeout?: number
  ): Promise<void> {
    const userId = await getCurrentUserId()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userId) headers['X-User-Id'] = userId

    try {
      const response = await fetch(`${API_BASE_URL}/api/servers/${serverId}/execute/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, timeout: timeout || 300000 })
      })

      if (!response.ok) {
        throw new Error('流式执行失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              switch (event.type) {
                case 'output':
                  onOutput(event.data)
                  break
                case 'error':
                  onError(event.data)
                  break
                case 'done':
                  onDone(event.exitCode)
                  return
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      onError((error as Error).message)
      onDone(1)
    }
  }
}

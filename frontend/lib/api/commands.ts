const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface CommandExecutionResult {
  success: boolean
  output: string
  error?: string
  exitCode?: number
  aiSuggestion?: string
}

export const commandApi = {
  async execute(serverId: string, command: string): Promise<CommandExecutionResult> {
    const response = await fetch(`${API_BASE_URL}/api/servers/${serverId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command }),
    })

    if (!response.ok) {
      throw new Error('命令执行失败')
    }

    return response.json()
  }
}

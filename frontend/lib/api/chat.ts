import { supabase } from '../supabase'
import { getApiHeaders, getApiHeadersWithAuth } from '../api-config'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export interface ChatMessage {
  id: string
  server_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  command_context?: any
  created_at: string
}

export interface AIChatResponse {
  response: string
  timestamp: string
}

export const chatApi = {
  async getMessages(serverId: string): Promise<ChatMessage[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}`)
      if (!response.ok) throw new Error('获取会话历史失败')
      const session = await response.json()
      return session.messages || []
    } catch (error) {
      console.error('Failed to load chat history:', error)
      return []
    }
  },

  async getSession(serverId: string): Promise<{ messages: ChatMessage[], commandHistory: any[] }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}`)
      if (!response.ok) throw new Error('获取会话历史失败')
      const session = await response.json()
      return {
        messages: session.messages || [],
        commandHistory: session.commandHistory || []
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      return { messages: [], commandHistory: [] }
    }
  },

  async clearMessages(serverId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}`, {
      method: 'DELETE'
    })
    if (!response.ok) throw new Error('清除会话历史失败')
  },

  async sendMessage(serverId: string, content: string): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        server_id: serverId,
        role: 'user',
        content
      }])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async chatWithAI(serverId: string, message: string, language?: string): Promise<AIChatResponse> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, language }),
    })

    if (!response.ok) {
      throw new Error('AI聊天失败')
    }

    return response.json()
  },

  async chatWithAIStream(
    serverId: string,
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: (timestamp: string) => void,
    onError: (error: string) => void,
    language?: string
  ): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, language }),
      })

      if (!response.ok) {
        throw new Error('流式聊天失败')
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
              const data = JSON.parse(line.slice(6))
              if (data.error) {
                onError(data.error)
                return
              }
              if (data.done) {
                onComplete(data.timestamp)
                return
              }
              if (data.chunk) {
                onChunk(data.chunk)
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      onError((error as Error).message)
    }
  },

  async autoExecute(serverId: string, task: string): Promise<any> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}/auto-execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task }),
    })

    if (!response.ok) {
      throw new Error('自动执行失败')
    }

    return response.json()
  },

  async autoExecuteStream(
    serverId: string,
    task: string,
    callbacks: {
      onStart?: (data: any) => void
      onIterationStart?: (data: any) => void
      onStatus?: (data: any) => void
      onReasoning?: (data: any) => void
      onCommandStart?: (data: any) => void
      onCommandOutput?: (data: any) => void
      onIterationComplete?: (data: any) => void
      onComplete?: (data: any) => void
      onDone?: (data: any) => void
      onError?: (data: any) => void
      onAbort?: () => void
    },
    signal?: AbortSignal,
    language?: string
  ): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${serverId}/auto-execute/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ task, language }),
        signal
      })

      if (!response.ok) {
        throw new Error('流式自动执行失败')
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
              const { type, data } = event

              switch (type) {
                case 'start':
                  callbacks.onStart?.(data)
                  break
                case 'iteration_start':
                  callbacks.onIterationStart?.(data)
                  break
                case 'status':
                  callbacks.onStatus?.(data)
                  break
                case 'reasoning':
                  callbacks.onReasoning?.(data)
                  break
                case 'command_start':
                  callbacks.onCommandStart?.(data)
                  break
                case 'command_output':
                  callbacks.onCommandOutput?.(data)
                  break
                case 'iteration_complete':
                  callbacks.onIterationComplete?.(data)
                  break
                case 'complete':
                  callbacks.onComplete?.(data)
                  break
                case 'done':
                  await callbacks.onDone?.(data)
                  break
                case 'error':
                  callbacks.onError?.(data)
                  break
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        callbacks.onAbort?.()
      } else {
        callbacks.onError?.({ message: (error as Error).message })
      }
    }
  },

  // ============ CLI 集成 API ============

  // 获取CLI状态
  async getCliStatus(): Promise<{
    installed: boolean
    version: string | null
    configured: boolean
    apiKeySynced: boolean
    lastSync: string | null
  }> {
    const response = await fetch(`${API_BASE_URL}/api/cli/status`)
    if (!response.ok) throw new Error('获取CLI状态失败')
    return response.json()
  },

  // 同步API配置到CLI
  async syncCliConfig(config: {
    apiKey: string
    baseUrl?: string
    model?: string
  }): Promise<{ success: boolean; message: string; configPath: string }> {
    const response = await fetch(`${API_BASE_URL}/api/cli/sync-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    if (!response.ok) throw new Error('同步CLI配置失败')
    return response.json()
  },

  // 两层架构：第一层CLI执行任务
  async executeTaskWithCli(serverId: string, task: string): Promise<{
    success: boolean
    iterations: number
    executedActions: any[]
    errors: string[]
    systemInfo: string
  }> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    const response = await fetch(`${API_BASE_URL}/api/cli/execute-task`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task, serverId })
    })
    if (!response.ok) throw new Error('CLI执行任务失败')
    return response.json()
  },

  // 两层架构：第二层AI解读结果
  async analyzeExecutionResult(
    task: string,
    executionResult: any,
    systemInfo?: string,
    language?: string
  ): Promise<{ success: boolean; analysis: string; timestamp: string }> {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getApiHeadersWithAuth())
    }

    const response = await fetch(`${API_BASE_URL}/api/cli/analyze-result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task, executionResult, systemInfo, language })
    })
    if (!response.ok) throw new Error('AI分析失败')
    return response.json()
  },

  // 两层架构：完整执行流程（CLI执行 + AI解读）
  async executeWithTwoLayers(
    serverId: string,
    task: string,
    callbacks: {
      onExecutionStart?: () => void
      onExecutionProgress?: (action: any) => void
      onExecutionComplete?: (result: any) => void
      onAnalysisStart?: () => void
      onAnalysisComplete?: (analysis: string) => void
      onError?: (error: string) => void
    }
  ): Promise<{ executionResult: any; analysis: string }> {
    try {
      // 第一层：CLI执行
      callbacks.onExecutionStart?.()
      const executionResult = await this.executeTaskWithCli(serverId, task)

      for (const action of executionResult.executedActions) {
        callbacks.onExecutionProgress?.(action)
      }
      callbacks.onExecutionComplete?.(executionResult)

      // 第二层：AI解读
      callbacks.onAnalysisStart?.()
      const analysisResult = await this.analyzeExecutionResult(
        task,
        executionResult,
        executionResult.systemInfo
      )
      callbacks.onAnalysisComplete?.(analysisResult.analysis)

      return {
        executionResult,
        analysis: analysisResult.analysis
      }
    } catch (error) {
      callbacks.onError?.((error as Error).message)
      throw error
    }
  }
}

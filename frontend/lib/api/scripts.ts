import { supabase } from '../supabase'
import { getApiHeaders } from '../api-config'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export interface ScriptExecutionResult {
  success: boolean
  logs: Array<{
    command: string
    output: string
    exitCode: number
    timestamp: string
  }>
  aiSuggestions?: string[]
}

export interface ScriptTemplate {
  id: string
  name: string
  description: string
  category: 'deployment' | 'maintenance' | 'monitoring' | 'docker' | 'security' | 'backup' | 'network' | 'custom'
  tags: string[]
  commands: any
  parameters?: any
  author?: string
  authorId?: string
  author_id?: string | null
  isOfficial?: boolean
  is_official?: boolean
  isPublic?: boolean
  is_public?: boolean
  usageCount?: number
  usage_count?: number
  likeCount?: number
  like_count?: number
  rating?: number
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
  documentContent?: string
  document_content?: string
  documentType?: 'markdown' | 'plain_text'
  document_type?: 'markdown' | 'text'
}

export const scriptApi = {
  async getAll(sort?: string, category?: string): Promise<ScriptTemplate[]> {
    const params = new URLSearchParams()
    if (sort) params.append('sort', sort)
    if (category && category !== 'all') params.append('category', category)

    const response = await fetch(`${API_BASE_URL}/api/scripts?${params}`)
    if (!response.ok) throw new Error('获取脚本列表失败')
    return response.json()
  },

  async getById(id: string): Promise<ScriptTemplate | null> {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${id}`)
    if (!response.ok) throw new Error('获取脚本失败')
    return response.json()
  },

  async search(query: string, category?: string): Promise<ScriptTemplate[]> {
    const params = new URLSearchParams()
    if (query) params.append('q', query)
    if (category) params.append('category', category)

    const response = await fetch(`${API_BASE_URL}/api/scripts?${params}`)
    if (!response.ok) throw new Error('搜索脚本失败')
    return response.json()
  },

  async execute(scriptId: string, serverId: string, parameters?: Record<string, any>, signal?: AbortSignal): Promise<ScriptExecutionResult> {
    const timeoutId = setTimeout(() => {
      // Only abort if no external signal provided
      if (!signal) throw new Error('Script execution timeout')
    }, 330000);

    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders(),
        },
        body: JSON.stringify({ serverId, parameters }),
        signal: signal,
      })

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Script execution failed');
      }

      return response.json()
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw error; // Re-throw AbortError for caller to handle
      }
      throw error;
    }
  },

  async like(scriptId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/like`, {
      method: 'POST',
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) throw new Error('点赞失败')
    return response.json()
  },

  async unlike(scriptId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/like`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) throw new Error('取消点赞失败')
    return response.json()
  },

  async getLikes(scriptId: string, userId?: string) {
    const headers: Record<string, string> = {}
    if (userId) headers['X-User-Id'] = userId

    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/likes`, { headers })
    if (!response.ok) throw new Error('获取点赞信息失败')
    return response.json()
  },

  async getPopular(limit: number = 5): Promise<ScriptTemplate[]> {
    const response = await fetch(`${API_BASE_URL}/api/scripts/popular?limit=${limit}`)
    if (!response.ok) throw new Error('获取热门脚本失败')
    return response.json()
  },

  async delete(scriptId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || '删除脚本失败')
    }
    return response.json()
  },

  async favorite(scriptId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/favorite`, {
      method: 'POST',
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) throw new Error('收藏失败')
    return response.json()
  },

  async unfavorite(scriptId: string, userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/favorite`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) throw new Error('取消收藏失败')
    return response.json()
  },

  async getFavorites(userId: string): Promise<ScriptTemplate[]> {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
      headers: { 'X-User-Id': userId }
    })
    if (!response.ok) throw new Error('获取收藏列表失败')
    return response.json()
  },

  async rate(scriptId: string, userId: string, rating: number) {
    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
      body: JSON.stringify({ rating })
    })
    if (!response.ok) throw new Error('评分失败')
    return response.json()
  },

  async getRating(scriptId: string, userId?: string) {
    const headers: Record<string, string> = {}
    if (userId) headers['X-User-Id'] = userId

    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/rating`, { headers })
    if (!response.ok) throw new Error('获取评分信息失败')
    return response.json()
  }
}

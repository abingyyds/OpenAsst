import { supabase } from './supabase'

export interface ApiConfig {
  anthropicApiKey?: string
  anthropicBaseUrl?: string
  anthropicModel?: string
  tavilyApiKey?: string
  serperApiKey?: string
}

export function getApiConfig(): ApiConfig {
  if (typeof window === 'undefined') {
    return {}
  }
  
  const savedConfig = localStorage.getItem('apiConfig')
  if (savedConfig) {
    try {
      return JSON.parse(savedConfig)
    } catch {
      return {}
    }
  }
  return {}
}

export function getApiHeaders(): Record<string, string> {
  const config = getApiConfig()
  const headers: Record<string, string> = {}

  if (config.anthropicApiKey) {
    headers['x-api-key'] = config.anthropicApiKey
  }

  if (config.anthropicBaseUrl) {
    headers['x-api-base-url'] = config.anthropicBaseUrl
  }

  if (config.anthropicModel) {
    headers['x-api-model'] = config.anthropicModel
  }

  if (config.tavilyApiKey) {
    headers['x-tavily-api-key'] = config.tavilyApiKey
  }

  if (config.serperApiKey) {
    headers['x-serper-api-key'] = config.serperApiKey
  }

  return headers
}

// Async version that includes user ID
export async function getApiHeadersWithAuth(): Promise<Record<string, string>> {
  const headers = getApiHeaders()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) {
      headers['X-User-Id'] = user.id
    }
  } catch (e) {
    console.error('Failed to get user ID:', e)
  }

  return headers
}

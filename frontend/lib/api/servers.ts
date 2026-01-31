import { supabase } from '../supabase'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export type ConnectionType = 'ssh' | 'local' | 'docker' | 'docker-remote' | 'kubernetes' | 'wsl'

export interface Server {
  id: string
  user_id?: string
  name: string
  connectionType: ConnectionType

  // SSH 连接配置
  host?: string
  port?: number
  username?: string
  auth_type?: 'password' | 'privateKey'
  encrypted_password?: string
  encrypted_private_key?: string
  password?: string
  privateKey?: string

  // Docker 连接配置
  containerName?: string
  containerId?: string
  isRemoteDocker?: boolean

  // Kubernetes 连接配置
  podName?: string
  namespace?: string
  kubeContainerName?: string
  isRemoteKubernetes?: boolean

  // WSL 连接配置
  distributionName?: string

  // Docker Remote API 连接配置
  dockerApiHost?: string
  dockerApiPort?: number
  dockerApiProtocol?: 'http' | 'https'
  dockerTlsCa?: string
  dockerTlsCert?: string
  dockerTlsKey?: string

  // 远程连接配置（用于远程Docker/Kubernetes）
  remoteHost?: string
  remotePort?: number
  remoteUsername?: string
  remoteAuthType?: 'password' | 'privateKey'
  remotePassword?: string
  remotePrivateKeyPath?: string
  remotePrivateKey?: string

  // 通用字段
  status?: 'connected' | 'disconnected' | 'error'
  last_connected_at?: string
  created_at?: string
  updated_at?: string
}

export const serverApi = {
  async getAll(): Promise<Server[]> {
    const response = await fetch(`${API_BASE_URL}/api/servers`)
    if (!response.ok) throw new Error('获取服务器列表失败')
    return response.json()
  },

  async getById(id: string): Promise<Server | null> {
    const response = await fetch(`${API_BASE_URL}/api/servers`)
    if (!response.ok) throw new Error('获取服务器失败')
    const servers = await response.json()
    return servers.find((s: Server) => s.id === id) || null
  },

  async create(server: Omit<Server, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>): Promise<Server> {
    const response = await fetch(`${API_BASE_URL}/api/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(server),
    })

    if (!response.ok) throw new Error('添加服务器失败')
    return response.json()
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/servers/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error('删除服务器失败')
  },

  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/servers/${id}/connect`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || '连接测试失败' }
    }

    return { success: true }
  },

  async testConnectionConfig(config: Omit<Server, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/servers/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })

    const result = await response.json()
    return result
  }
}

'use client'

import { useState } from 'react'
import { serverApi, ConnectionType } from '@/lib/api/servers'

interface AddServerModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddServerModal({ isOpen, onClose, onSuccess }: AddServerModalProps) {
  const [connectionType, setConnectionType] = useState<ConnectionType>('ssh')
  const [formData, setFormData] = useState({
    name: '',
    // SSH
    host: '',
    port: 22,
    username: '',
    auth_type: 'password' as 'password' | 'privateKey',
    password: '',
    privateKeyPath: '',
    saveCredentials: false, // 是否存储密码/密钥
    // Docker
    containerName: '',
    containerId: '',
    isRemoteDocker: false,
    // Kubernetes
    podName: '',
    namespace: 'default',
    kubeContainerName: '',
    isRemoteKubernetes: false,
    // WSL
    distributionName: 'Ubuntu',
    // Docker Remote API
    dockerApiHost: '',
    dockerApiPort: 2376,
    dockerApiProtocol: 'https' as 'http' | 'https',
    dockerTlsCa: '',
    dockerTlsCert: '',
    dockerTlsKey: '',
    // 远程连接配置
    remoteHost: '',
    remotePort: 22,
    remoteUsername: '',
    remoteAuthType: 'password' as 'password' | 'privateKey',
    remotePassword: '',
    remotePrivateKeyPath: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  if (!isOpen) return null

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return '请输入连接名称'
    }

    if (connectionType === 'ssh') {
      if (!formData.host.trim()) return '请输入主机地址'
      if (!formData.port || formData.port <= 0) return '请输入有效的端口号'
      if (!formData.username.trim()) return '请输入用户名'
      if (formData.auth_type === 'password' && !formData.password.trim()) {
        return '请输入密码'
      }
      if (formData.auth_type === 'privateKey' && !formData.privateKeyPath.trim()) {
        return '请输入私钥路径'
      }
    } else if (connectionType === 'docker') {
      if (!formData.containerName.trim() && !formData.containerId.trim()) {
        return '请输入容器名称或容器ID'
      }
      if (formData.isRemoteDocker) {
        if (!formData.remoteHost.trim()) return '请输入远程主机地址'
        if (!formData.remotePort || formData.remotePort <= 0) return '请输入有效的远程端口号'
        if (!formData.remoteUsername.trim()) return '请输入远程用户名'
        if (formData.remoteAuthType === 'password' && !formData.remotePassword.trim()) {
          return '请输入远程服务器密码'
        }
        if (formData.remoteAuthType === 'privateKey' && !formData.remotePrivateKeyPath.trim()) {
          return '请输入远程服务器私钥路径'
        }
      }
    } else if (connectionType === 'docker-remote') {
      if (!formData.dockerApiHost.trim()) return '请输入Docker API主机地址'
      if (!formData.dockerApiPort || formData.dockerApiPort <= 0) return '请输入有效的Docker API端口号'
      if (!formData.containerName.trim() && !formData.containerId.trim()) {
        return '请输入容器名称或容器ID'
      }
    } else if (connectionType === 'kubernetes') {
      if (!formData.podName.trim()) return '请输入Pod名称'
    } else if (connectionType === 'wsl') {
      if (!formData.distributionName.trim()) return '请输入发行版名称'
    }

    return null
  }

  const handleTestConnection = async () => {
    // 验证表单
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setTestLoading(true)
    setTestResult(null)
    setError('')

    try {
      // 构建测试配置
      const testConfig: any = {
        name: formData.name,
        connectionType
      }

      if (connectionType === 'ssh') {
        testConfig.host = formData.host
        testConfig.port = formData.port
        testConfig.username = formData.username
        testConfig.authType = formData.auth_type
        if (formData.auth_type === 'password') {
          testConfig.password = formData.password
        } else {
          testConfig.privateKeyPath = formData.privateKeyPath
        }
      } else if (connectionType === 'local') {
        // Local connection doesn't need additional config
      } else if (connectionType === 'docker') {
        testConfig.containerName = formData.containerName
        testConfig.containerId = formData.containerId
        testConfig.isRemoteDocker = formData.isRemoteDocker
        if (formData.isRemoteDocker) {
          testConfig.remoteHost = formData.remoteHost
          testConfig.remotePort = formData.remotePort
          testConfig.remoteUsername = formData.remoteUsername
          testConfig.remoteAuthType = formData.remoteAuthType
          if (formData.remoteAuthType === 'password') {
            testConfig.remotePassword = formData.remotePassword
          } else {
            testConfig.remotePrivateKeyPath = formData.remotePrivateKeyPath
          }
        }
      } else if (connectionType === 'docker-remote') {
        testConfig.dockerApiHost = formData.dockerApiHost
        testConfig.dockerApiPort = formData.dockerApiPort
        testConfig.dockerApiProtocol = formData.dockerApiProtocol
        testConfig.containerName = formData.containerName
        testConfig.containerId = formData.containerId
        if (formData.dockerTlsCa) testConfig.dockerTlsCa = formData.dockerTlsCa
        if (formData.dockerTlsCert) testConfig.dockerTlsCert = formData.dockerTlsCert
        if (formData.dockerTlsKey) testConfig.dockerTlsKey = formData.dockerTlsKey
      } else if (connectionType === 'kubernetes') {
        testConfig.podName = formData.podName
        testConfig.namespace = formData.namespace
        testConfig.containerName = formData.kubeContainerName
      } else if (connectionType === 'wsl') {
        testConfig.distributionName = formData.distributionName
      }

      const result = await serverApi.testConnectionConfig(testConfig)

      if (result.success) {
        setTestResult({ success: true, message: '连接测试成功！' })
      } else {
        setTestResult({ success: false, message: result.error || '连接测试失败' })
      }
    } catch (err) {
      setTestResult({ success: false, message: '连接测试失败：' + (err as Error).message })
    } finally {
      setTestLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证表单
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoading(true)

    try {
      // 根据连接类型构建提交数据
      const submitData: any = {
        name: formData.name,
        connectionType
      }

      if (connectionType === 'ssh') {
        submitData.host = formData.host
        submitData.port = formData.port
        submitData.username = formData.username
        submitData.authType = formData.auth_type
        submitData.saveCredentials = formData.saveCredentials
        if (formData.auth_type === 'password') {
          submitData.password = formData.password
        } else {
          submitData.privateKeyPath = formData.privateKeyPath
        }
      } else if (connectionType === 'local') {
        // 本地连接不需要额外配置
        // Local connection doesn't need additional configuration
      } else if (connectionType === 'docker') {
        submitData.containerName = formData.containerName
        submitData.containerId = formData.containerId
        submitData.isRemoteDocker = formData.isRemoteDocker
        if (formData.isRemoteDocker) {
          submitData.remoteHost = formData.remoteHost
          submitData.remotePort = formData.remotePort
          submitData.remoteUsername = formData.remoteUsername
          submitData.remoteAuthType = formData.remoteAuthType
          if (formData.remoteAuthType === 'password') {
            submitData.remotePassword = formData.remotePassword
          } else {
            submitData.remotePrivateKeyPath = formData.remotePrivateKeyPath
          }
        }
      } else if (connectionType === 'docker-remote') {
        submitData.dockerApiHost = formData.dockerApiHost
        submitData.dockerApiPort = formData.dockerApiPort
        submitData.dockerApiProtocol = formData.dockerApiProtocol
        submitData.containerName = formData.containerName
        submitData.containerId = formData.containerId
        if (formData.dockerTlsCa) submitData.dockerTlsCa = formData.dockerTlsCa
        if (formData.dockerTlsCert) submitData.dockerTlsCert = formData.dockerTlsCert
        if (formData.dockerTlsKey) submitData.dockerTlsKey = formData.dockerTlsKey
      } else if (connectionType === 'kubernetes') {
        submitData.podName = formData.podName
        submitData.namespace = formData.namespace
        submitData.containerName = formData.kubeContainerName
      } else if (connectionType === 'wsl') {
        submitData.distributionName = formData.distributionName
      }

      await serverApi.create(submitData)
      onSuccess()
      onClose()

      // 重置表单
      setFormData({
        name: '',
        host: '',
        port: 22,
        username: '',
        auth_type: 'password',
        password: '',
        privateKeyPath: '',
        saveCredentials: false,
        containerName: '',
        containerId: '',
        isRemoteDocker: false,
        podName: '',
        namespace: 'default',
        kubeContainerName: '',
        isRemoteKubernetes: false,
        distributionName: 'Ubuntu',
        dockerApiHost: '',
        dockerApiPort: 2376,
        dockerApiProtocol: 'https',
        dockerTlsCa: '',
        dockerTlsCert: '',
        dockerTlsKey: '',
        remoteHost: '',
        remotePort: 22,
        remoteUsername: '',
        remoteAuthType: 'password',
        remotePassword: '',
        remotePrivateKeyPath: ''
      })
      setConnectionType('ssh')
    } catch (err) {
      setError('添加连接失败，请检查信息后重试')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="terminal-card p-6 w-full max-w-md my-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-green-400 font-mono text-xl"
        >
          ×
        </button>
        <h2 className="text-2xl font-bold mb-4 text-green-400 font-mono"># Add Connection</h2>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-400 p-3 rounded mb-4 text-sm font-mono">
            [ERROR] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Connection Name */}
          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">name:</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
              placeholder="e.g. production-server"
            />
          </div>

          {/* Connection Type */}
          <div>
            <label className="block text-sm font-mono text-green-500 mb-2">type:</label>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as ConnectionType)}
              className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
            >
              <option value="ssh">SSH Server</option>
              <option value="local">Local Terminal</option>
              <option value="docker">Docker Container</option>
              <option value="docker-remote">Docker Remote API</option>
              <option value="kubernetes">Kubernetes Pod</option>
              <option value="wsl">WSL</option>
            </select>
          </div>

          {/* SSH Config */}
          {connectionType === 'ssh' && (
            <>
              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">host:</label>
                <input
                  type="text"
                  required
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">port:</label>
                <input
                  type="number"
                  required
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">username:</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="root"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">auth_type:</label>
                <select
                  value={formData.auth_type}
                  onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as 'password' | 'privateKey' })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                >
                  <option value="password">password</option>
                  <option value="privateKey">private_key</option>
                </select>
              </div>

              {formData.auth_type === 'password' ? (
                <div>
                  <label className="block text-sm font-mono text-green-500 mb-2">password:</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-mono text-green-500 mb-2">key_path:</label>
                  <input
                    type="text"
                    required
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                    placeholder="~/.ssh/id_rsa"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveCredentials"
                  checked={formData.saveCredentials}
                  onChange={(e) => setFormData({ ...formData, saveCredentials: e.target.checked })}
                  className="w-4 h-4 accent-green-500"
                />
                <label htmlFor="saveCredentials" className="text-sm font-mono text-green-400">
                  save credentials (store password/key locally)
                </label>
              </div>
            </>
          )}

          {/* Local Terminal */}
          {connectionType === 'local' && (
            <div className="bg-green-900/20 border border-green-500/30 p-3 rounded text-sm text-green-400 font-mono">
              Local terminal executes commands directly on the server.
            </div>
          )}

          {/* Docker Config */}
          {connectionType === 'docker' && (
            <>
              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">container_name:</label>
                <input
                  type="text"
                  value={formData.containerName}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="my-container"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">container_id: (optional)</label>
                <input
                  type="text"
                  value={formData.containerId}
                  onChange={(e) => setFormData({ ...formData, containerId: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="abc123def456"
                />
              </div>

              {/* Remote Docker option */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isRemoteDocker"
                  checked={formData.isRemoteDocker}
                  onChange={(e) => setFormData({ ...formData, isRemoteDocker: e.target.checked })}
                  className="w-4 h-4 accent-green-500"
                />
                <label htmlFor="isRemoteDocker" className="text-sm font-mono text-green-400">
                  Docker on remote server (via SSH)
                </label>
              </div>

              {/* Remote SSH Config */}
              {formData.isRemoteDocker && (
                <div className="border-l-2 border-green-500 pl-4 space-y-3">
                  <div className="text-sm font-mono text-green-400"># Remote SSH Config</div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">host:</label>
                    <input
                      type="text"
                      required
                      value={formData.remoteHost}
                      onChange={(e) => setFormData({ ...formData, remoteHost: e.target.value })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                      placeholder="192.168.1.100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">port:</label>
                    <input
                      type="number"
                      required
                      value={formData.remotePort}
                      onChange={(e) => setFormData({ ...formData, remotePort: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">username:</label>
                    <input
                      type="text"
                      required
                      value={formData.remoteUsername}
                      onChange={(e) => setFormData({ ...formData, remoteUsername: e.target.value })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                      placeholder="root"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">auth_type:</label>
                    <select
                      value={formData.remoteAuthType}
                      onChange={(e) => setFormData({ ...formData, remoteAuthType: e.target.value as 'password' | 'privateKey' })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                    >
                      <option value="password">password</option>
                      <option value="privateKey">private_key</option>
                    </select>
                  </div>

                  {formData.remoteAuthType === 'password' ? (
                    <div>
                      <label className="block text-sm font-mono text-green-500 mb-2">password:</label>
                      <input
                        type="password"
                        required
                        value={formData.remotePassword}
                        onChange={(e) => setFormData({ ...formData, remotePassword: e.target.value })}
                        className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-mono text-green-500 mb-2">key_path:</label>
                      <input
                        type="text"
                        required
                        value={formData.remotePrivateKeyPath}
                        onChange={(e) => setFormData({ ...formData, remotePrivateKeyPath: e.target.value })}
                        className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                        placeholder="~/.ssh/id_rsa"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="bg-yellow-900/20 border border-yellow-500/30 p-3 rounded text-sm text-yellow-400 font-mono">
                Note: Provide container name or ID.{formData.isRemoteDocker && ' Remote Docker requires SSH first.'}
              </div>
            </>
          )}

          {/* Docker Remote API Config */}
          {connectionType === 'docker-remote' && (
            <>
              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">api_host:</label>
                <input
                  type="text"
                  required
                  value={formData.dockerApiHost}
                  onChange={(e) => setFormData({ ...formData, dockerApiHost: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">api_port:</label>
                <input
                  type="number"
                  required
                  value={formData.dockerApiPort}
                  onChange={(e) => setFormData({ ...formData, dockerApiPort: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">protocol:</label>
                <select
                  value={formData.dockerApiProtocol}
                  onChange={(e) => setFormData({ ...formData, dockerApiProtocol: e.target.value as 'http' | 'https' })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500"
                >
                  <option value="https">https (recommended)</option>
                  <option value="http">http</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">container_name:</label>
                <input
                  type="text"
                  value={formData.containerName}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="my-container"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">container_id: (optional)</label>
                <input
                  type="text"
                  value={formData.containerId}
                  onChange={(e) => setFormData({ ...formData, containerId: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="abc123def456"
                />
              </div>

              {/* TLS Config */}
              {formData.dockerApiProtocol === 'https' && (
                <div className="border-l-2 border-green-500 pl-4 space-y-3">
                  <div className="text-sm font-mono text-green-400"># TLS Config (optional)</div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">ca_cert:</label>
                    <textarea
                      value={formData.dockerTlsCa}
                      onChange={(e) => setFormData({ ...formData, dockerTlsCa: e.target.value })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono text-xs focus:outline-none focus:border-green-500 placeholder-gray-600"
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">client_cert:</label>
                    <textarea
                      value={formData.dockerTlsCert}
                      onChange={(e) => setFormData({ ...formData, dockerTlsCert: e.target.value })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono text-xs focus:outline-none focus:border-green-500 placeholder-gray-600"
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-green-500 mb-2">client_key:</label>
                    <textarea
                      value={formData.dockerTlsKey}
                      onChange={(e) => setFormData({ ...formData, dockerTlsKey: e.target.value })}
                      className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono text-xs focus:outline-none focus:border-green-500 placeholder-gray-600"
                      rows={3}
                      placeholder="-----BEGIN PRIVATE KEY-----"
                    />
                  </div>
                </div>
              )}

              <div className="bg-yellow-900/20 border border-yellow-500/30 p-3 rounded text-sm text-yellow-400 font-mono">
                Note: Docker Remote API connects via TCP. Provide container name or ID.
              </div>
            </>
          )}

          {/* Kubernetes Config */}
          {connectionType === 'kubernetes' && (
            <>
              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">pod_name:</label>
                <input
                  type="text"
                  required
                  value={formData.podName}
                  onChange={(e) => setFormData({ ...formData, podName: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="my-pod-abc123"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">namespace:</label>
                <input
                  type="text"
                  value={formData.namespace}
                  onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="default"
                />
              </div>

              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">container: (optional)</label>
                <input
                  type="text"
                  value={formData.kubeContainerName}
                  onChange={(e) => setFormData({ ...formData, kubeContainerName: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="specify if pod has multiple containers"
                />
              </div>
            </>
          )}

          {/* WSL Config */}
          {connectionType === 'wsl' && (
            <>
              <div>
                <label className="block text-sm font-mono text-green-500 mb-2">distribution:</label>
                <input
                  type="text"
                  value={formData.distributionName}
                  onChange={(e) => setFormData({ ...formData, distributionName: e.target.value })}
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
                  placeholder="Ubuntu"
                />
              </div>

              <div className="bg-green-900/20 border border-green-500/30 p-3 rounded text-sm text-green-400 font-mono">
                Tip: Run <code className="bg-green-900/50 px-1 rounded">wsl -l</code> to list installed distributions.
              </div>
            </>
          )}

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded text-sm font-mono ${
              testResult.success
                ? 'bg-green-900/30 text-green-400 border border-green-500/50'
                : 'bg-red-900/30 text-red-400 border border-red-500/50'
            }`}>
              {testResult.success ? '[OK] ' : '[FAIL] '}
              {testResult.message}
            </div>
          )}

          {/* Test Connection Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              className="w-full px-4 py-2 bg-gray-800 border border-green-900/50 text-green-400 rounded hover:bg-gray-700 disabled:opacity-50 font-mono"
              disabled={loading || testLoading}
            >
              {testLoading ? 'testing...' : '> test_connection'}
            </button>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-green-900/50 text-gray-400 rounded hover:bg-green-900/20 font-mono"
              disabled={loading}
            >
              cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 font-mono btn-glow"
              disabled={loading}
            >
              {loading ? 'adding...' : '> add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

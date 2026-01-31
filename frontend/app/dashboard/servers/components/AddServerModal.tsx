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
    // Docker
    containerName: '',
    containerId: '',
    isRemoteDocker: false,
    // Kubernetes
    podName: '',
    namespace: 'default',
    containerName: '',
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
        testConfig.containerName = formData.containerName
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
        submitData.containerName = formData.containerName
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
        containerName: '',
        containerId: '',
        podName: '',
        namespace: 'default',
        containerName: '',
        distributionName: 'Ubuntu'
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">添加连接</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 连接名称 */}
          <div>
            <label className="block text-sm font-medium mb-1">连接名称</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              placeholder="例如：生产服务器"
            />
          </div>

          {/* 连接类型选择 */}
          <div>
            <label className="block text-sm font-medium mb-1">连接类型</label>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as ConnectionType)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="ssh">SSH 服务器</option>
              <option value="local">本地终端</option>
              <option value="docker">Docker 容器</option>
              <option value="docker-remote">Docker Remote API</option>
              <option value="kubernetes">Kubernetes Pod</option>
              <option value="wsl">WSL (Windows Subsystem for Linux)</option>
            </select>
          </div>

          {/* SSH 配置 */}
          {connectionType === 'ssh' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">主机地址</label>
                <input
                  type="text"
                  required
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">端口</label>
                <input
                  type="number"
                  required
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：root"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">认证方式</label>
                <select
                  value={formData.auth_type}
                  onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as 'password' | 'privateKey' })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="password">密码</option>
                  <option value="privateKey">私钥</option>
                </select>
              </div>

              {formData.auth_type === 'password' ? (
                <div>
                  <label className="block text-sm font-medium mb-1">密码</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">私钥路径</label>
                  <input
                    type="text"
                    required
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="例如：~/.ssh/id_rsa"
                  />
                </div>
              )}
            </>
          )}

          {/* 本地终端配置 */}
          {connectionType === 'local' && (
            <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
              本地终端将直接在服务器上执行命令，无需额外配置。
            </div>
          )}

          {/* Docker 配置 */}
          {connectionType === 'docker' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">容器名称</label>
                <input
                  type="text"
                  value={formData.containerName}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：my-container"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">容器 ID（可选）</label>
                <input
                  type="text"
                  value={formData.containerId}
                  onChange={(e) => setFormData({ ...formData, containerId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：abc123def456"
                />
              </div>

              {/* 远程Docker选项 */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isRemoteDocker"
                  checked={formData.isRemoteDocker}
                  onChange={(e) => setFormData({ ...formData, isRemoteDocker: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isRemoteDocker" className="text-sm font-medium">
                  Docker在远程服务器上（通过SSH连接）
                </label>
              </div>

              {/* 远程SSH配置 */}
              {formData.isRemoteDocker && (
                <div className="border-l-4 border-blue-500 pl-4 space-y-3">
                  <div className="text-sm font-medium text-blue-700">远程服务器SSH配置</div>

                  <div>
                    <label className="block text-sm font-medium mb-1">主机地址</label>
                    <input
                      type="text"
                      required
                      value={formData.remoteHost}
                      onChange={(e) => setFormData({ ...formData, remoteHost: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="例如：192.168.1.100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">端口</label>
                    <input
                      type="number"
                      required
                      value={formData.remotePort}
                      onChange={(e) => setFormData({ ...formData, remotePort: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">用户名</label>
                    <input
                      type="text"
                      required
                      value={formData.remoteUsername}
                      onChange={(e) => setFormData({ ...formData, remoteUsername: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="例如：root"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">认证方式</label>
                    <select
                      value={formData.remoteAuthType}
                      onChange={(e) => setFormData({ ...formData, remoteAuthType: e.target.value as 'password' | 'privateKey' })}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="password">密码</option>
                      <option value="privateKey">私钥</option>
                    </select>
                  </div>

                  {formData.remoteAuthType === 'password' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">密码</label>
                      <input
                        type="password"
                        required
                        value={formData.remotePassword}
                        onChange={(e) => setFormData({ ...formData, remotePassword: e.target.value })}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-1">私钥路径</label>
                      <input
                        type="text"
                        required
                        value={formData.remotePrivateKeyPath}
                        onChange={(e) => setFormData({ ...formData, remotePrivateKeyPath: e.target.value })}
                        className="w-full px-3 py-2 border rounded"
                        placeholder="例如：~/.ssh/id_rsa"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-700">
                提示：容器名称和容器 ID 至少填写一个。{formData.isRemoteDocker && '远程Docker需要先SSH连接到服务器，再执行docker命令。'}
              </div>
            </>
          )}

          {/* Docker Remote API 配置 */}
          {connectionType === 'docker-remote' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Docker API 主机地址</label>
                <input
                  type="text"
                  required
                  value={formData.dockerApiHost}
                  onChange={(e) => setFormData({ ...formData, dockerApiHost: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Docker API 端口</label>
                <input
                  type="number"
                  required
                  value={formData.dockerApiPort}
                  onChange={(e) => setFormData({ ...formData, dockerApiPort: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="2376"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">协议</label>
                <select
                  value={formData.dockerApiProtocol}
                  onChange={(e) => setFormData({ ...formData, dockerApiProtocol: e.target.value as 'http' | 'https' })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="https">HTTPS (推荐)</option>
                  <option value="http">HTTP</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">容器名称</label>
                <input
                  type="text"
                  value={formData.containerName}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：my-container"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">容器 ID（可选）</label>
                <input
                  type="text"
                  value={formData.containerId}
                  onChange={(e) => setFormData({ ...formData, containerId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：abc123def456"
                />
              </div>

              {/* TLS 证书配置（可选） */}
              {formData.dockerApiProtocol === 'https' && (
                <div className="border-l-4 border-blue-500 pl-4 space-y-3">
                  <div className="text-sm font-medium text-blue-700">TLS 证书配置（可选）</div>

                  <div>
                    <label className="block text-sm font-medium mb-1">CA 证书</label>
                    <textarea
                      value={formData.dockerTlsCa}
                      onChange={(e) => setFormData({ ...formData, dockerTlsCa: e.target.value })}
                      className="w-full px-3 py-2 border rounded font-mono text-xs"
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">客户端证书</label>
                    <textarea
                      value={formData.dockerTlsCert}
                      onChange={(e) => setFormData({ ...formData, dockerTlsCert: e.target.value })}
                      className="w-full px-3 py-2 border rounded font-mono text-xs"
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">客户端私钥</label>
                    <textarea
                      value={formData.dockerTlsKey}
                      onChange={(e) => setFormData({ ...formData, dockerTlsKey: e.target.value })}
                      className="w-full px-3 py-2 border rounded font-mono text-xs"
                      rows={3}
                      placeholder="-----BEGIN PRIVATE KEY-----"
                    />
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-700">
                提示：Docker Remote API 通过 TCP 端口直接连接到 Docker，无需 SSH。容器名称和容器 ID 至少填写一个。
              </div>
            </>
          )}

          {/* Kubernetes 配置 */}
          {connectionType === 'kubernetes' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Pod 名称</label>
                <input
                  type="text"
                  required
                  value={formData.podName}
                  onChange={(e) => setFormData({ ...formData, podName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：my-pod-abc123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">命名空间</label>
                <input
                  type="text"
                  value={formData.namespace}
                  onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="default"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">容器名称（可选）</label>
                <input
                  type="text"
                  value={formData.containerName}
                  onChange={(e) => setFormData({ ...formData, containerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="如果 Pod 有多个容器，请指定"
                />
              </div>
            </>
          )}

          {/* WSL 配置 */}
          {connectionType === 'wsl' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">发行版名称</label>
                <input
                  type="text"
                  value={formData.distributionName}
                  onChange={(e) => setFormData({ ...formData, distributionName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="例如：Ubuntu"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
                提示：使用 <code className="bg-blue-100 px-1 rounded">wsl -l</code> 命令查看已安装的发行版。
              </div>
            </>
          )}

          {/* 测试连接结果 */}
          {testResult && (
            <div className={`p-3 rounded text-sm ${
              testResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult.success ? '✓ ' : '✗ '}
              {testResult.message}
            </div>
          )}

          {/* 测试连接按钮 */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              disabled={loading || testLoading}
            >
              {testLoading ? '测试中...' : '🔌 测试连接'}
            </button>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '添加中...' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

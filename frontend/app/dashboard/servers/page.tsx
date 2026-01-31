'use client'

import { useState, useEffect } from 'react'
import { serverApi, Server } from '@/lib/api/servers'
import Link from 'next/link'
import AddServerModal from './components/AddServerModal'

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [filteredServers, setFilteredServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'status'>('name')

  useEffect(() => {
    loadServers()
  }, [])

  useEffect(() => {
    // Filter and sort servers
    let filtered = servers.filter(server =>
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.host.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Sort servers
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'status') {
      filtered.sort((a, b) => {
        if (a.status === 'connected' && b.status !== 'connected') return -1
        if (a.status !== 'connected' && b.status === 'connected') return 1
        return 0
      })
    }

    setFilteredServers(filtered)
  }, [servers, searchQuery, sortBy])

  const loadServers = async () => {
    try {
      const data = await serverApi.getAll()
      setServers(data)
    } catch (error) {
      console.error('加载服务器失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (serverId: string, serverName: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm(`确定要删除连接 "${serverName}" 吗？`)) {
      return
    }

    try {
      await serverApi.delete(serverId)
      setServers(servers.filter(s => s.id !== serverId))
    } catch (error) {
      console.error('删除连接失败:', error)
      alert('删除失败，请重试')
    }
  }

  if (loading) {
    return <div className="text-center py-12">加载中...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">连接管理</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + 添加连接
        </button>
      </div>

      {/* 搜索和排序栏 */}
      {servers.length > 0 && (
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索服务器名称或地址..."
            className="flex-1 px-4 py-2 border rounded"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'status')}
            className="px-4 py-2 border rounded"
          >
            <option value="name">按名称排序</option>
            <option value="status">按状态排序</option>
          </select>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <p className="text-gray-500 mb-4">还没有添加服务器</p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            添加第一台服务器
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServers.map(server => (
            <div key={server.id} className="relative">
              <Link href={`/dashboard/servers/${server.id}`}>
                <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition cursor-pointer">
                  <h3 className="font-bold text-lg mb-2">{server.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">{server.host}:{server.port}</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      server.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'
                    }`}></span>
                    <span className="text-sm text-gray-500">{server.status}</span>
                  </div>
                </div>
              </Link>
              <button
                onClick={(e) => handleDelete(server.id, server.name, e)}
                className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded hover:bg-red-700 transition-opacity"
                title="删除服务器"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 显示搜索结果为空的提示 */}
      {servers.length > 0 && filteredServers.length === 0 && (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <p className="text-gray-500">没有找到匹配的服务器</p>
        </div>
      )}

      <AddServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadServers}
      />
    </div>
  )
}

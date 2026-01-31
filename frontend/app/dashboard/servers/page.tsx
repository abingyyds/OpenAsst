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
      (server.host && server.host.toLowerCase().includes(searchQuery.toLowerCase()))
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
    return <div className="text-center py-12 text-green-500 font-mono">loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">{'>'} Servers</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
        >
          + add_server
        </button>
      </div>

      {/* Search and Sort Bar */}
      {servers.length > 0 && (
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="search servers..."
            className="flex-1 px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-100 font-mono focus:outline-none focus:border-green-500 placeholder-gray-600"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'status')}
            className="px-4 py-2 bg-[#0a0f0d] border border-green-900/50 rounded text-green-400 font-mono focus:outline-none focus:border-green-500"
          >
            <option value="name">sort: name</option>
            <option value="status">sort: status</option>
          </select>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="terminal-card p-12 text-center">
          <p className="text-gray-500 mb-4 font-mono">no servers configured</p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 font-mono btn-glow"
          >
            + add_first_server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServers.map(server => (
            <div key={server.id} className="relative group">
              <Link href={`/dashboard/servers/${server.id}`}>
                <div className="terminal-card p-6 hover:border-green-500/50 transition cursor-pointer">
                  <h3 className="font-bold text-lg mb-2 text-green-400 font-mono">{server.name}</h3>
                  <p className="text-sm text-gray-500 mb-2 font-mono">{server.host}:{server.port}</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      server.status === 'connected' ? 'bg-green-400 status-online' : 'bg-gray-600'
                    }`}></span>
                    <span className={`text-sm font-mono ${
                      server.status === 'connected' ? 'text-green-500' : 'text-gray-500'
                    }`}>{server.status}</span>
                  </div>
                </div>
              </Link>
              <button
                onClick={(e) => handleDelete(server.id, server.name, e)}
                className="absolute top-2 right-2 p-2 bg-red-900/50 text-red-400 rounded hover:bg-red-800 transition-opacity opacity-0 group-hover:opacity-100"
                title="Delete server"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty search results */}
      {servers.length > 0 && filteredServers.length === 0 && (
        <div className="terminal-card p-12 text-center">
          <p className="text-gray-500 font-mono">no matching servers found</p>
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

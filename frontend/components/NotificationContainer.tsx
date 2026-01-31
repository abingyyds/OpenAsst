'use client'

import { useNotification } from '@/contexts/NotificationContext'

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotification()

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] animate-slide-in ${
            notification.type === 'success' ? 'bg-green-500 text-white' :
            notification.type === 'error' ? 'bg-red-500 text-white' :
            notification.type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
          }`}
        >
          <span className="text-xl">
            {notification.type === 'success' ? '✓' :
             notification.type === 'error' ? '✕' :
             notification.type === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-white hover:opacity-75"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

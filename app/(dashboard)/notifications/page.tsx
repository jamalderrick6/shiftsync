'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  metadata: string | null
  createdAt: string
}

const NOTIFICATION_ICONS: Record<string, string> = {
  shift_published: '📢',
  shift_assigned: '📋',
  swap_request: '🔄',
  swap_accepted: '✅',
  swap_approved: '✅',
  swap_rejected: '❌',
  drop_request: '📤',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  async function fetchNotifications() {
    setLoading(true)
    const params = filter === 'unread' ? '?unread=true' : ''
    const res = await fetch(`/api/notifications${params}`)
    if (res.ok) setNotifications(await res.json())
    setLoading(false)
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    fetchNotifications()
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-gray-500 text-sm">{unreadCount} unread notifications</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === 'unread' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm text-blue-600 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">🔔</p>
          <p className="text-gray-600 font-medium">No notifications</p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === 'unread' ? "You're all caught up!" : "You haven't received any notifications yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-xl border shadow-sm p-4 flex items-start gap-4 cursor-pointer hover:shadow-md transition-shadow ${
                !notification.read ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => !notification.read && markRead(notification.id)}
            >
              <div className="text-2xl flex-shrink-0">
                {NOTIFICATION_ICONS[notification.type] || '📌'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-gray-900 text-sm">{notification.title}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    )}
                    <span className="text-xs text-gray-400">
                      {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{notification.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

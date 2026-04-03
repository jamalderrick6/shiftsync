'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

interface SidebarProps {
  user: {
    name: string
    email: string
    role: string
  }
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'manager', 'staff'] },
  { href: '/schedule', label: 'Schedule', icon: '📅', roles: ['admin', 'manager', 'staff'] },
  { href: '/staff', label: 'Staff', icon: '👥', roles: ['admin', 'manager'] },
  { href: '/locations', label: 'Locations', icon: '📍', roles: ['admin', 'manager'] },
  { href: '/analytics', label: 'Analytics', icon: '📈', roles: ['admin', 'manager'] },
  { href: '/audit', label: 'Audit Log', icon: '📋', roles: ['admin'] },
  { href: '/notifications', label: 'Notifications', icon: '🔔', roles: ['admin', 'manager', 'staff'] },
  { href: '/profile', label: 'My Profile', icon: '👤', roles: ['admin', 'manager', 'staff'] },
]

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role))

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <span className="font-bold text-lg">SS</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">ShiftSync</h1>
            <p className="text-xs text-gray-400">Coastal Eats</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  )
}

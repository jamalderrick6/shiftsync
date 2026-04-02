import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format, addDays, startOfWeek } from 'date-fns'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)!
  if (!session) return null

  const today = format(new Date(), 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'yyyy-MM-dd')

  // Fetch stats
  const [totalShifts, publishedShifts, draftShifts, totalStaff, totalLocations, myUpcomingShifts, recentNotifications] =
    await Promise.all([
      prisma.shift.count({ where: { date: { gte: weekStart, lte: weekEnd } } }),
      prisma.shift.count({ where: { date: { gte: weekStart, lte: weekEnd }, status: 'published' } }),
      prisma.shift.count({ where: { date: { gte: weekStart, lte: weekEnd }, status: 'draft' } }),
      prisma.user.count({ where: { role: { in: ['staff', 'manager'] } } }),
      prisma.location.count(),
      session.user.role === 'staff'
        ? prisma.shiftAssignment.findMany({
            where: {
              userId: session.user.id,
              shift: { date: { gte: today } },
            },
            include: {
              shift: { include: { location: true, skill: true } },
            },
            orderBy: { shift: { date: 'asc' } },
            take: 5,
          })
        : [],
      prisma.notification.findMany({
        where: { userId: session.user.id, read: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

  const isManager = ['admin', 'manager'].includes(session.user.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {session.user.name.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">
          {format(new Date(), 'EEEE, MMMM d, yyyy')} - Week of {format(new Date(weekStart), 'MMM d')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">This Week's Shifts</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalShifts}</p>
          <p className="text-xs text-green-600 mt-1">{publishedShifts} published</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Draft Shifts</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{draftShifts}</p>
          <p className="text-xs text-yellow-600 mt-1">Awaiting publish</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Total Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalStaff}</p>
          <p className="text-xs text-blue-600 mt-1">Active team members</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500">Locations</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalLocations}</p>
          <p className="text-xs text-purple-600 mt-1">Restaurant locations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming shifts for staff */}
        {!isManager && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">My Upcoming Shifts</h3>
              <Link href="/schedule" className="text-sm text-blue-600 hover:underline">
                View schedule
              </Link>
            </div>
            <div className="p-5">
              {myUpcomingShifts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No upcoming shifts</p>
              ) : (
                <div className="space-y-3">
                  {myUpcomingShifts.map((assignment: any) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {assignment.shift.location.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {assignment.shift.skill.name} |{' '}
                          {assignment.shift.startTime} - {assignment.shift.endTime}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(assignment.shift.date + 'T00:00:00'), 'EEE, MMM d')}
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            assignment.shift.status === 'published'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {assignment.shift.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Notifications</h3>
            <Link href="/notifications" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="p-5">
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No unread notifications</p>
            ) : (
              <div className="space-y-3">
                {recentNotifications.map((n) => (
                  <div key={n.id} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions for Managers */}
        {isManager && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <Link
                href="/schedule"
                className="flex flex-col items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
              >
                <span className="text-2xl mb-2">📅</span>
                <span className="text-sm font-medium text-blue-900">View Schedule</span>
              </Link>
              <Link
                href="/staff"
                className="flex flex-col items-center p-4 bg-green-50 hover:bg-green-100 rounded-xl transition-colors"
              >
                <span className="text-2xl mb-2">👥</span>
                <span className="text-sm font-medium text-green-900">Manage Staff</span>
              </Link>
              <Link
                href="/analytics"
                className="flex flex-col items-center p-4 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
              >
                <span className="text-2xl mb-2">📈</span>
                <span className="text-sm font-medium text-purple-900">Analytics</span>
              </Link>
              <Link
                href="/locations"
                className="flex flex-col items-center p-4 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
              >
                <span className="text-2xl mb-2">📍</span>
                <span className="text-sm font-medium text-orange-900">Locations</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

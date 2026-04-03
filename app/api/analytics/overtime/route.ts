import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { shiftDurationHours, getWeekStart } from '@/lib/timezone'
import { format, addDays, parseISO } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate') || format(new Date(), 'yyyy-MM-dd')
  const endDate = searchParams.get('endDate') || format(addDays(new Date(), 27), 'yyyy-MM-dd')
  const locationId = searchParams.get('locationId')

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      status: { not: 'no_show' },
      shift: {
        date: { gte: startDate, lte: endDate },
        ...(locationId ? { locationId } : {}),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true, desiredHours: true } },
      shift: { include: { location: true } },
    },
  })

  // Group by user and week
  const userWeeklyHours: Record<string, Record<string, { hours: number; shiftCount: number }>> = {}

  for (const assignment of assignments) {
    const { user, shift } = assignment
    const weekStart = getWeekStart(shift.date)
    const hours = shiftDurationHours(shift.startTime, shift.endTime)

    if (!userWeeklyHours[user.id]) {
      userWeeklyHours[user.id] = {}
    }
    if (!userWeeklyHours[user.id][weekStart]) {
      userWeeklyHours[user.id][weekStart] = { hours: 0, shiftCount: 0 }
    }
    userWeeklyHours[user.id][weekStart].hours += hours
    userWeeklyHours[user.id][weekStart].shiftCount++
  }

  // Find overtime situations
  const overtimeAlerts: Array<{
    user: { id: string; name: string; email: string }
    weekStart: string
    hours: number
    shiftCount: number
    severity: 'warning' | 'overtime'
  }> = []

  const usersById: Record<string, { id: string; name: string; email: string; desiredHours: number }> = {}
  for (const assignment of assignments) {
    usersById[assignment.user.id] = assignment.user
  }

  for (const [userId, weeks] of Object.entries(userWeeklyHours)) {
    const user = usersById[userId]
    if (!user) continue

    for (const [weekStart, data] of Object.entries(weeks)) {
      if (data.hours >= 35) {
        overtimeAlerts.push({
          user: { id: user.id, name: user.name, email: user.email },
          weekStart,
          hours: Math.round(data.hours * 10) / 10,
          shiftCount: data.shiftCount,
          severity: data.hours >= 40 ? 'overtime' : 'warning',
        })
      }
    }
  }

  // Summary stats
  const totalOvertimeWeeks = overtimeAlerts.filter((a) => a.severity === 'overtime').length
  const totalWarningWeeks = overtimeAlerts.filter((a) => a.severity === 'warning').length

  return NextResponse.json({
    alerts: overtimeAlerts.sort((a, b) => b.hours - a.hours),
    summary: {
      totalOvertimeWeeks,
      totalWarningWeeks,
      totalAffectedStaff: new Set(overtimeAlerts.map((a) => a.user.id)).size,
    },
  })
}

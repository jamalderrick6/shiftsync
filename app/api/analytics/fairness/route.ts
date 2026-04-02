import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { shiftDurationHours } from '@/lib/timezone'
import { format, addDays, parseISO } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate') || format(new Date(), 'yyyy-MM-dd')
  const endDate = searchParams.get('endDate') || format(addDays(new Date(), 27), 'yyyy-MM-dd')
  const locationId = searchParams.get('locationId')

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      status: { not: 'no_show' },
      shift: {
        date: { gte: startDate, lte: endDate },
        status: 'published',
        ...(locationId ? { locationId } : {}),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true, desiredHours: true } },
      shift: { include: { location: true, skill: true } },
    },
  })

  // Aggregate hours per user
  const userStats: Record<string, {
    user: { id: string; name: string; email: string; desiredHours: number }
    totalHours: number
    shiftCount: number
    skills: Set<string>
    locations: Set<string>
    weeklyHours: Record<string, number>
  }> = {}

  for (const assignment of assignments) {
    const { user, shift } = assignment
    if (!userStats[user.id]) {
      userStats[user.id] = {
        user,
        totalHours: 0,
        shiftCount: 0,
        skills: new Set(),
        locations: new Set(),
        weeklyHours: {},
      }
    }

    const hours = shiftDurationHours(shift.startTime, shift.endTime)
    userStats[user.id].totalHours += hours
    userStats[user.id].shiftCount++
    userStats[user.id].skills.add(shift.skill.name)
    userStats[user.id].locations.add(shift.location.name)

    // Track weekly hours
    const weekKey = format(parseISO(shift.date), 'yyyy-\'W\'II')
    userStats[user.id].weeklyHours[weekKey] =
      (userStats[user.id].weeklyHours[weekKey] || 0) + hours
  }

  const stats = Object.values(userStats).map((s) => ({
    user: s.user,
    totalHours: Math.round(s.totalHours * 10) / 10,
    shiftCount: s.shiftCount,
    skills: Array.from(s.skills),
    locations: Array.from(s.locations),
    weeklyHours: s.weeklyHours,
    hoursVsDesired: Math.round((s.totalHours - s.user.desiredHours) * 10) / 10,
    fulfillmentRate:
      s.user.desiredHours > 0
        ? Math.round((s.totalHours / s.user.desiredHours) * 1000) / 10
        : null,
  }))

  // Calculate fairness metrics
  const allHours = stats.map((s) => s.totalHours)
  const avgHours = allHours.length > 0
    ? allHours.reduce((a, b) => a + b, 0) / allHours.length
    : 0
  const maxHours = allHours.length > 0 ? Math.max(...allHours) : 0
  const minHours = allHours.length > 0 ? Math.min(...allHours) : 0
  const variance =
    allHours.length > 0
      ? allHours.reduce((acc, h) => acc + Math.pow(h - avgHours, 2), 0) / allHours.length
      : 0

  return NextResponse.json({
    stats: stats.sort((a, b) => b.totalHours - a.totalHours),
    summary: {
      avgHours: Math.round(avgHours * 10) / 10,
      maxHours: Math.round(maxHours * 10) / 10,
      minHours: Math.round(minHours * 10) / 10,
      stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
      totalStaff: stats.length,
    },
  })
}

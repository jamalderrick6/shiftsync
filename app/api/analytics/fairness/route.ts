import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { shiftDurationHours, timeToMinutes } from '@/lib/timezone'
import { format, addDays, parseISO, getDay } from 'date-fns'

// Premium shift: Friday (5) or Saturday (6), starting at or after 17:00
function isPremiumShift(date: string, startTime: string): boolean {
  const dayOfWeek = getDay(parseISO(date)) // 0=Sun, 5=Fri, 6=Sat
  const startMinutes = timeToMinutes(startTime)
  return (dayOfWeek === 5 || dayOfWeek === 6) && startMinutes >= 17 * 60
}

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
    premiumShiftCount: number
    premiumShifts: { date: string; startTime: string; endTime: string; location: string; skill: string }[]
    skills: Set<string>
    locations: Set<string>
    weeklyHours: Record<string, number>
  }> = {}

  let totalPremiumShifts = 0

  for (const assignment of assignments) {
    const { user, shift } = assignment
    if (!userStats[user.id]) {
      userStats[user.id] = {
        user,
        totalHours: 0,
        shiftCount: 0,
        premiumShiftCount: 0,
        premiumShifts: [],
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

    if (isPremiumShift(shift.date, shift.startTime)) {
      userStats[user.id].premiumShiftCount++
      userStats[user.id].premiumShifts.push({
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        location: shift.location.name,
        skill: shift.skill.name,
      })
      totalPremiumShifts++
    }

    // Track weekly hours
    const weekKey = format(parseISO(shift.date), 'yyyy-\'W\'II')
    userStats[user.id].weeklyHours[weekKey] =
      (userStats[user.id].weeklyHours[weekKey] || 0) + hours
  }

  const staffCount = Object.keys(userStats).length
  const avgPremiumPerStaff = staffCount > 0 ? totalPremiumShifts / staffCount : 0

  const stats = Object.values(userStats).map((s) => ({
    user: s.user,
    totalHours: Math.round(s.totalHours * 10) / 10,
    shiftCount: s.shiftCount,
    premiumShiftCount: s.premiumShiftCount,
    premiumShifts: s.premiumShifts.sort((a, b) => a.date.localeCompare(b.date)),
    // >0: getting more than fair share; <0: getting fewer
    premiumFairnessOffset: Math.round((s.premiumShiftCount - avgPremiumPerStaff) * 10) / 10,
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

  // Premium shift fairness score: 0-100, higher = more equitable distribution
  const premiumCounts = stats.map((s) => s.premiumShiftCount)
  const premiumVariance = premiumCounts.length > 1
    ? premiumCounts.reduce((acc, c) => acc + Math.pow(c - avgPremiumPerStaff, 2), 0) / premiumCounts.length
    : 0
  const premiumStdDev = Math.sqrt(premiumVariance)
  // Score: 100 when stdDev = 0 (perfect equity), drops as distribution becomes uneven
  const premiumFairnessScore = premiumStdDev === 0
    ? 100
    : Math.max(0, Math.round(100 - (premiumStdDev / Math.max(avgPremiumPerStaff, 1)) * 50))

  return NextResponse.json({
    stats: stats.sort((a, b) => b.totalHours - a.totalHours),
    summary: {
      avgHours: Math.round(avgHours * 10) / 10,
      maxHours: Math.round(maxHours * 10) / 10,
      minHours: Math.round(minHours * 10) / 10,
      stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
      totalStaff: stats.length,
      totalPremiumShifts,
      avgPremiumPerStaff: Math.round(avgPremiumPerStaff * 10) / 10,
      premiumFairnessScore,
    },
  })
}

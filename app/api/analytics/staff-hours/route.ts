import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { shiftDurationHours, getWeekStart } from '@/lib/timezone'
import { format, addDays, parseISO } from 'date-fns'

// GET /api/analytics/staff-hours?weekStart=YYYY-MM-DD&userIds=id1,id2,...
// Returns current weekly hours for each requested user — used by the assign modal
// to show overtime proximity before selection.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get('weekStart') || getWeekStart(format(new Date(), 'yyyy-MM-dd'))
  const userIdsParam = searchParams.get('userIds')

  if (!userIdsParam) return NextResponse.json({})

  const userIds = userIdsParam.split(',').filter(Boolean)
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: { in: userIds },
      status: { not: 'no_show' },
      shift: { date: { gte: weekStart, lte: weekEnd } },
    },
    include: { shift: { select: { startTime: true, endTime: true } } },
  })

  const hours: Record<string, number> = {}
  for (const a of assignments) {
    hours[a.userId] = (hours[a.userId] ?? 0) + shiftDurationHours(a.shift.startTime, a.shift.endTime)
  }

  // Round to 1 decimal
  for (const id of userIds) {
    hours[id] = Math.round((hours[id] ?? 0) * 10) / 10
  }

  return NextResponse.json(hours)
}

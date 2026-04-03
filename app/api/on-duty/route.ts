import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'
import { timeToMinutes } from '@/lib/timezone'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // For managers scope to their locations
  let managedLocationIds: string[] | null = null
  if (session.user.role === 'manager') {
    const managed = await prisma.locationManager.findMany({
      where: { userId: session.user.id },
      select: { locationId: true },
    })
    managedLocationIds = managed.map((m) => m.locationId)
  }

  // Get all published shifts for today
  const shifts = await prisma.shift.findMany({
    where: {
      date: today,
      status: 'published',
      ...(managedLocationIds ? { locationId: { in: managedLocationIds } } : {}),
    },
    include: {
      location: true,
      skill: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ locationId: 'asc' }, { startTime: 'asc' }],
  })

  // Filter to currently active shifts (start <= now <= end, handling overnight)
  const activeShifts = shifts.filter((shift) => {
    const start = timeToMinutes(shift.startTime)
    const end = timeToMinutes(shift.endTime)
    const isOvernight = end <= start

    if (isOvernight) {
      // Shift spans midnight: active if now >= start OR now <= end
      return currentMinutes >= start || currentMinutes <= end
    }
    return currentMinutes >= start && currentMinutes <= end
  })

  // Group by location
  const byLocation: Record<string, {
    location: { id: string; name: string; timezone: string }
    activeShifts: typeof activeShifts
    staffOnDuty: { id: string; name: string; skill: string; until: string }[]
  }> = {}

  for (const shift of activeShifts) {
    const locId = shift.locationId
    if (!byLocation[locId]) {
      byLocation[locId] = {
        location: shift.location,
        activeShifts: [],
        staffOnDuty: [],
      }
    }
    byLocation[locId].activeShifts.push(shift)
    for (const assignment of shift.assignments) {
      byLocation[locId].staffOnDuty.push({
        id: assignment.user.id,
        name: assignment.user.name,
        skill: shift.skill.name,
        until: shift.endTime,
      })
    }
  }

  // Also include locations with no active shifts so managers can see coverage gaps
  const allLocations = await prisma.location.findMany({
    where: managedLocationIds ? { id: { in: managedLocationIds } } : {},
    orderBy: { name: 'asc' },
  })

  for (const loc of allLocations) {
    if (!byLocation[loc.id]) {
      byLocation[loc.id] = {
        location: loc,
        activeShifts: [],
        staffOnDuty: [],
      }
    }
  }

  return NextResponse.json({
    asOf: now.toISOString(),
    locations: Object.values(byLocation).sort((a, b) =>
      a.location.name.localeCompare(b.location.name)
    ),
  })
}

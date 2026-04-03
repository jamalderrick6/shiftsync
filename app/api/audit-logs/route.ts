import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const locationId = searchParams.get('locationId')
  const entityType = searchParams.get('entityType')
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = 50

  // Build date filter on createdAt
  const dateFilter: Record<string, Date> = {}
  if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00`)
  if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59`)

  // If filtering by location we need to find relevant entity IDs
  let shiftIds: string[] | null = null
  if (locationId) {
    const shifts = await prisma.shift.findMany({
      where: { locationId },
      select: { id: true },
    })
    shiftIds = shifts.map((s) => s.id)
  }

  const where = {
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    ...(entityType ? { entityType } : {}),
    ...(shiftIds
      ? {
          OR: [
            { entityType: 'shift', entityId: { in: shiftIds } },
            { entityType: 'shiftAssignment', metadata: { contains: shiftIds[0] } },
          ],
        }
      : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

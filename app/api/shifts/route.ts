import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get('locationId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const status = searchParams.get('status')
  const userId = searchParams.get('userId')

  const shifts = await prisma.shift.findMany({
    where: {
      ...(locationId ? { locationId } : {}),
      ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
      ...(status ? { status } : {}),
      ...(userId ? { assignments: { some: { userId } } } : {}),
    },
    include: {
      location: true,
      skill: true,
      assignments: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json(shifts)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { locationId, skillId, date, startTime, endTime, headcount, status } = body

  if (!locationId || !skillId || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const shift = await prisma.shift.create({
    data: {
      locationId,
      skillId,
      date,
      startTime,
      endTime,
      headcount: headcount || 1,
      status: status || 'draft',
    },
    include: {
      location: true,
      skill: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'create',
    entityType: 'shift',
    entityId: shift.id,
    after: { locationId, skillId, date, startTime, endTime, headcount, status: shift.status },
  })

  return NextResponse.json(shift, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'Missing shift id' }, { status: 400 })

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (shift.status === 'published') {
    return NextResponse.json({ error: 'Cannot delete a published shift' }, { status: 400 })
  }

  await prisma.shift.delete({ where: { id } })

  await createAuditLog({
    userId: session.user.id,
    action: 'delete',
    entityType: 'shift',
    entityId: id,
    before: { ...shift },
  })

  return NextResponse.json({ success: true })
}

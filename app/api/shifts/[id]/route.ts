import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    include: {
      location: true,
      skill: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  })

  if (!shift) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(shift)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { date, startTime, endTime, headcount, skillId, locationId, status } = body

  const existingShift = await prisma.shift.findUnique({ where: { id: params.id } })
  if (!existingShift) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existingShift.status === 'published' && !['admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Cannot edit a published shift' }, { status: 400 })
  }

  const updatedShift = await prisma.shift.update({
    where: { id: params.id },
    data: {
      ...(date ? { date } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(headcount !== undefined ? { headcount } : {}),
      ...(skillId ? { skillId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      location: true,
      skill: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'update',
    entityType: 'shift',
    entityId: params.id,
    before: existingShift as any,
    after: updatedShift as any,
  })

  return NextResponse.json(updatedShift)
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const shift = await prisma.shift.findUnique({ where: { id: params.id } })
  if (!shift) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (shift.status === 'published') {
    return NextResponse.json({ error: 'Cannot delete a published shift' }, { status: 400 })
  }

  // Delete assignments first
  await prisma.shiftAssignment.deleteMany({ where: { shiftId: params.id } })
  await prisma.shift.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}

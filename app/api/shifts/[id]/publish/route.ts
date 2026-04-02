import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { emitToUser } from '@/lib/sse'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    include: { location: true, skill: true, assignments: { include: { user: true } } },
  })

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.status === 'published') {
    return NextResponse.json({ error: 'Shift already published' }, { status: 400 })
  }

  const updatedShift = await prisma.shift.update({
    where: { id: params.id },
    data: { status: 'published', publishedAt: new Date() },
    include: {
      location: true,
      skill: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })

  // Notify all assigned staff
  for (const assignment of shift.assignments) {
    await createNotification({
      userId: assignment.userId,
      type: 'shift_published',
      title: 'Shift Published',
      message: `Your ${shift.skill.name} shift at ${shift.location.name} on ${shift.date} (${shift.startTime} - ${shift.endTime}) is now published.`,
      metadata: { shiftId: shift.id },
    })

    // Send real-time SSE event
    try {
      emitToUser(assignment.userId, {
        type: 'shift_published',
        data: { shiftId: shift.id, date: shift.date, location: shift.location.name },
      })
    } catch {
      // ignore
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'publish',
    entityType: 'shift',
    entityId: params.id,
    after: { status: 'published', publishedAt: updatedShift.publishedAt },
  })

  return NextResponse.json(updatedShift)
}

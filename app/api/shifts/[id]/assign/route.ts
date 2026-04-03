import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runConstraintChecks, getSuggestedAlternatives } from '@/lib/scheduling'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, override = false, overrideReason = '' } = body

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const shift = await prisma.shift.findUnique({
    where: { id: params.id },
    include: { location: true, skill: true },
  })

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  // Check if already assigned
  const existing = await prisma.shiftAssignment.findUnique({
    where: { shiftId_userId: { shiftId: params.id, userId } },
  })
  if (existing) {
    return NextResponse.json({ error: 'User already assigned to this shift' }, { status: 409 })
  }

  // Check headcount
  const currentAssignments = await prisma.shiftAssignment.count({
    where: { shiftId: params.id },
  })
  if (currentAssignments >= shift.headcount) {
    return NextResponse.json(
      { error: `Shift is at capacity (${shift.headcount} staff)` },
      { status: 409 }
    )
  }

  // Run constraint checks
  const checks = await runConstraintChecks(userId, params.id)

  if (!checks.canAssign && !override) {
    const suggestions = await getSuggestedAlternatives(params.id)
    return NextResponse.json(
      {
        error: 'Constraint violations',
        violations: checks.violations,
        warnings: checks.warnings,
        suggestions,
        requiresOverride: true,
        requiresOverrideReason: checks.requiresOverrideReason,
      },
      { status: 422 }
    )
  }

  // 7th consecutive day: override is allowed but reason is mandatory
  if (checks.requiresOverrideReason && override && !overrideReason.trim()) {
    return NextResponse.json(
      { error: 'A documented reason is required to assign a 7th consecutive working day.', requiresOverrideReason: true },
      { status: 422 }
    )
  }

  // Create assignment inside a transaction — re-check double-booking atomically
  // to prevent two managers assigning the same person simultaneously
  let assignment: { id: string; shiftId: string; userId: string; status: string; createdAt: Date; user: { id: string; name: string; email: string } }
  try {
    assignment = await prisma.$transaction(async (tx) => {
      // Re-check for conflicting assignments within the transaction
      const conflictingAssignment = await tx.shiftAssignment.findFirst({
        where: {
          userId,
          status: { not: 'no_show' },
          shift: {
            date: shift.date,
            id: { not: params.id },
          },
        },
        include: { shift: { include: { location: true } } },
      })

      if (conflictingAssignment) {
        const s = conflictingAssignment.shift as typeof conflictingAssignment.shift & { location: { name: string } }
        throw new Error(
          `CONCURRENT_CONFLICT:${s.location.name}:${s.startTime}-${s.endTime}`
        )
      }

      return tx.shiftAssignment.create({
        data: { shiftId: params.id, userId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      })
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : ''
    if (message.startsWith('CONCURRENT_CONFLICT:')) {
      const [, location, time] = message.split(':')
      return NextResponse.json(
        {
          error: 'Concurrent assignment conflict',
          message: `Another manager just assigned this staff member to a shift at ${location} (${time}) at the same time. Please refresh and try again.`,
          concurrent: true,
        },
        { status: 409 }
      )
    }
    // Unique constraint — already assigned
    return NextResponse.json(
      { error: 'User already assigned to this shift' },
      { status: 409 }
    )
  }

  // Notify user if shift is published
  if (shift.status === 'published') {
    await createNotification({
      userId,
      type: 'shift_assigned',
      title: 'New Shift Assigned',
      message: `You have been assigned to a ${shift.skill.name} shift at ${shift.location.name} on ${shift.date} (${shift.startTime} - ${shift.endTime})`,
      metadata: { shiftId: params.id },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'assign',
    entityType: 'shiftAssignment',
    entityId: assignment.id,
    after: { shiftId: params.id, userId, override, warnings: checks.warnings },
    metadata: overrideReason ? { overrideReason } : undefined,
  })

  return NextResponse.json({
    assignment,
    warnings: checks.warnings,
    violations: checks.violations,
  })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await prisma.shiftAssignment.delete({
    where: { shiftId_userId: { shiftId: params.id, userId } },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'unassign',
    entityType: 'shiftAssignment',
    entityId: `${params.id}_${userId}`,
  })

  return NextResponse.json({ success: true })
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const suggestions = await getSuggestedAlternatives(params.id)
  return NextResponse.json(suggestions)
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { runConstraintChecks } from '@/lib/scheduling'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const isAdmin = ['admin', 'manager'].includes(session.user.role)

  const requests = await prisma.swapRequest.findMany({
    where: {
      ...(isAdmin ? {} : {
        OR: [
          { requesterId: session.user.id },
          { targetId: session.user.id },
        ],
      }),
      ...(status ? { status } : {}),
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      target: { select: { id: true, name: true, email: true } },
      sourceAssignment: {
        include: {
          shift: { include: { location: true, skill: true } },
          user: { select: { id: true, name: true } },
        },
      },
      targetAssignment: {
        include: {
          shift: { include: { location: true, skill: true } },
          user: { select: { id: true, name: true } },
        },
      },
      shift: { include: { location: true, skill: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { type, sourceAssignmentId, targetAssignmentId, targetId, expiresInHours = 48 } = body

  if (!type || !sourceAssignmentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the requester owns the source assignment
  const sourceAssignment = await prisma.shiftAssignment.findUnique({
    where: { id: sourceAssignmentId },
    include: { shift: { include: { location: true, skill: true } } },
  })

  if (!sourceAssignment) {
    return NextResponse.json({ error: 'Source assignment not found' }, { status: 404 })
  }

  if (sourceAssignment.userId !== session.user.id && !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Not your assignment' }, { status: 403 })
  }

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)

  let targetAssignment = null
  if (targetAssignmentId) {
    targetAssignment = await prisma.shiftAssignment.findUnique({
      where: { id: targetAssignmentId },
      include: { shift: { include: { location: true, skill: true } } },
    })

    if (!targetAssignment) {
      return NextResponse.json({ error: 'Target assignment not found' }, { status: 404 })
    }

    // For swaps, validate the counterparty can work the shift
    const requesterChecks = await runConstraintChecks(session.user.id, targetAssignment.shiftId)
    const targetUserChecks = await runConstraintChecks(targetAssignment.userId, sourceAssignment.shiftId)

    if (!requesterChecks.canAssign || !targetUserChecks.canAssign) {
      return NextResponse.json({
        error: 'Constraint violations for swap',
        requesterViolations: requesterChecks.violations,
        targetViolations: targetUserChecks.violations,
      }, { status: 422 })
    }
  }

  const swapRequest = await prisma.swapRequest.create({
    data: {
      requesterId: session.user.id,
      targetId: targetId || targetAssignment?.userId || null,
      sourceAssignmentId,
      targetAssignmentId: targetAssignmentId || null,
      shiftId: sourceAssignment.shiftId,
      type,
      expiresAt,
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      target: { select: { id: true, name: true, email: true } },
      sourceAssignment: {
        include: { shift: { include: { location: true, skill: true } } },
      },
      shift: { include: { location: true, skill: true } },
    },
  })

  // Notify target if specified
  if (targetId || targetAssignment?.userId) {
    const notifyUserId = targetId || targetAssignment!.userId
    await createNotification({
      userId: notifyUserId,
      type: 'swap_request',
      title: 'Shift Swap Request',
      message: `${session.user.name} wants to swap a shift with you on ${sourceAssignment.shift.date} at ${sourceAssignment.shift.location.name}.`,
      metadata: { swapRequestId: swapRequest.id },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'create',
    entityType: 'swapRequest',
    entityId: swapRequest.id,
    after: { type, sourceAssignmentId, targetAssignmentId, targetId },
  })

  return NextResponse.json(swapRequest, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, action, managerNote } = body

  const swapRequest = await prisma.swapRequest.findUnique({
    where: { id },
    include: {
      requester: true,
      target: true,
      sourceAssignment: { include: { shift: true } },
      targetAssignment: { include: { shift: true } },
    },
  })

  if (!swapRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isManager = ['admin', 'manager'].includes(session.user.role)
  const isRequester = swapRequest.requesterId === session.user.id
  const isTarget = swapRequest.targetId === session.user.id

  let newStatus = swapRequest.status

  if (action === 'accept' && isTarget) {
    newStatus = 'accepted'
  } else if (action === 'reject' && (isTarget || isManager)) {
    newStatus = 'rejected'
  } else if (action === 'cancel' && (isRequester || isManager)) {
    newStatus = 'cancelled'
  } else if (action === 'approve' && isManager) {
    newStatus = 'approved'
    // Execute the swap
    if (swapRequest.type === 'swap' && swapRequest.targetAssignmentId) {
      await prisma.shiftAssignment.update({
        where: { id: swapRequest.sourceAssignmentId },
        data: { userId: swapRequest.target!.id },
      })
      await prisma.shiftAssignment.update({
        where: { id: swapRequest.targetAssignmentId },
        data: { userId: swapRequest.requesterId },
      })
    }
  } else if (action === 'deny' && isManager) {
    newStatus = 'rejected'
  } else {
    return NextResponse.json({ error: 'Invalid action or permissions' }, { status: 400 })
  }

  const updated = await prisma.swapRequest.update({
    where: { id },
    data: { status: newStatus, managerNote: managerNote || undefined },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      target: { select: { id: true, name: true, email: true } },
      shift: { include: { location: true, skill: true } },
    },
  })

  // Notify relevant parties
  if (action === 'accept') {
    await createNotification({
      userId: swapRequest.requesterId,
      type: 'swap_accepted',
      title: 'Swap Request Accepted',
      message: `${swapRequest.target?.name || 'The other staff'} accepted your swap request. Awaiting manager approval.`,
      metadata: { swapRequestId: id },
    })
  } else if (action === 'approve') {
    await createNotification({
      userId: swapRequest.requesterId,
      type: 'swap_approved',
      title: 'Swap Approved',
      message: `Your shift swap has been approved by management.`,
      metadata: { swapRequestId: id },
    })
    if (swapRequest.targetId) {
      await createNotification({
        userId: swapRequest.targetId,
        type: 'swap_approved',
        title: 'Swap Approved',
        message: `Your shift swap has been approved by management.`,
        metadata: { swapRequestId: id },
      })
    }
  } else if (action === 'reject' || action === 'deny') {
    await createNotification({
      userId: swapRequest.requesterId,
      type: 'swap_rejected',
      title: 'Swap Request Rejected',
      message: `Your shift swap request has been rejected.${managerNote ? ` Reason: ${managerNote}` : ''}`,
      metadata: { swapRequestId: id },
    })
  }

  return NextResponse.json(updated)
}

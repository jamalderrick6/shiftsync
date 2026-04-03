import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { checkDoubleBooking, checkMinRestPeriod, checkSkillMatch, checkLocationCertification } from '@/lib/scheduling'

// PATCH: claim / cancel / approve / deny a drop request
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, managerNote } = body

  const drop = await prisma.dropRequest.findUnique({
    where: { id: params.id },
    include: {
      assignment: {
        include: { shift: { include: { location: true, skill: true } } },
      },
      user: { select: { id: true, name: true } },
    },
  })

  if (!drop) return NextResponse.json({ error: 'Drop request not found' }, { status: 404 })

  const isManager = ['admin', 'manager'].includes(session.user.role)
  const isOwner = drop.userId === session.user.id

  if (action === 'claim') {
    if (drop.status !== 'open') {
      return NextResponse.json({ error: 'Drop request is no longer open' }, { status: 400 })
    }
    if (isOwner) {
      return NextResponse.json({ error: 'Cannot claim your own drop request' }, { status: 400 })
    }
    if (drop.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Drop request has expired' }, { status: 400 })
    }

    // Validate claimer is qualified
    const shift = drop.assignment.shift
    const hasSkill = await checkSkillMatch(session.user.id, shift.skillId)
    if (!hasSkill) {
      return NextResponse.json({ error: `You do not have the required skill: ${shift.skill.name}` }, { status: 422 })
    }
    const hasCert = await checkLocationCertification(session.user.id, shift.locationId)
    if (!hasCert) {
      return NextResponse.json({ error: `You are not certified for location: ${shift.location.name}` }, { status: 422 })
    }
    const doubleBook = await checkDoubleBooking(session.user.id, shift.id, shift.date, shift.startTime, shift.endTime, shift.location.timezone)
    if (doubleBook.hasConflict) {
      return NextResponse.json({ error: doubleBook.message }, { status: 422 })
    }
    const rest = await checkMinRestPeriod(session.user.id, shift.date, shift.startTime, shift.endTime)
    if (rest.hasConflict) {
      return NextResponse.json({ error: rest.message }, { status: 422 })
    }

    const updated = await prisma.dropRequest.update({
      where: { id: params.id },
      data: { status: 'claimed', claimedByUserId: session.user.id },
    })

    // Notify original owner and managers
    await createNotification({
      userId: drop.userId,
      type: 'drop_claimed',
      title: 'Shift Drop Claimed',
      message: `${session.user.name} has claimed your dropped ${shift.skill.name} shift on ${shift.date}. Awaiting manager approval.`,
      metadata: { dropRequestId: drop.id },
    })

    const managers = await prisma.locationManager.findMany({
      where: { locationId: shift.locationId },
      select: { userId: true },
    })
    for (const mgr of managers) {
      await createNotification({
        userId: mgr.userId,
        type: 'drop_claimed',
        title: 'Drop Request Claimed — Needs Approval',
        message: `${session.user.name} wants to pick up ${drop.user.name}'s ${shift.skill.name} shift at ${shift.location.name} on ${shift.date}.`,
        metadata: { dropRequestId: drop.id },
      })
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'claim',
      entityType: 'dropRequest',
      entityId: drop.id,
      after: { claimedByUserId: session.user.id },
    })

    return NextResponse.json(updated)
  }

  if (action === 'cancel') {
    if (!isOwner && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!['open', 'claimed'].includes(drop.status)) {
      return NextResponse.json({ error: 'Cannot cancel a resolved drop request' }, { status: 400 })
    }

    const updated = await prisma.dropRequest.update({
      where: { id: params.id },
      data: { status: 'cancelled' },
    })

    // If there was a claimer, notify them
    if (drop.claimedByUserId) {
      await createNotification({
        userId: drop.claimedByUserId,
        type: 'drop_cancelled',
        title: 'Drop Request Cancelled',
        message: `The drop request you claimed for the ${drop.assignment.shift.skill.name} shift on ${drop.assignment.shift.date} has been cancelled.`,
        metadata: { dropRequestId: drop.id },
      })
    }

    return NextResponse.json(updated)
  }

  if (action === 'approve') {
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (drop.status !== 'claimed' || !drop.claimedByUserId) {
      return NextResponse.json({ error: 'Drop request must be claimed before approval' }, { status: 400 })
    }

    // Transfer the assignment to claimer
    await prisma.shiftAssignment.update({
      where: { id: drop.assignmentId },
      data: { userId: drop.claimedByUserId },
    })

    const updated = await prisma.dropRequest.update({
      where: { id: params.id },
      data: { status: 'approved' },
    })

    const shift = drop.assignment.shift

    await createNotification({
      userId: drop.userId,
      type: 'drop_approved',
      title: 'Drop Request Approved',
      message: `Your drop of the ${shift.skill.name} shift at ${shift.location.name} on ${shift.date} has been approved.`,
      metadata: { dropRequestId: drop.id },
    })
    await createNotification({
      userId: drop.claimedByUserId,
      type: 'drop_approved',
      title: 'Shift Pickup Approved',
      message: `You have been assigned the ${shift.skill.name} shift at ${shift.location.name} on ${shift.date} (${shift.startTime}–${shift.endTime}).`,
      metadata: { dropRequestId: drop.id },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'approve',
      entityType: 'dropRequest',
      entityId: drop.id,
      before: { assignedTo: drop.userId },
      after: { assignedTo: drop.claimedByUserId, managerNote },
    })

    return NextResponse.json(updated)
  }

  if (action === 'deny') {
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (drop.status !== 'claimed') {
      return NextResponse.json({ error: 'Can only deny a claimed drop request' }, { status: 400 })
    }

    // Revert to open so another staff can claim it
    const updated = await prisma.dropRequest.update({
      where: { id: params.id },
      data: { status: 'open', claimedByUserId: null },
    })

    if (drop.claimedByUserId) {
      await createNotification({
        userId: drop.claimedByUserId,
        type: 'drop_denied',
        title: 'Shift Pickup Denied',
        message: `Your request to pick up the ${drop.assignment.shift.skill.name} shift on ${drop.assignment.shift.date} was denied.${managerNote ? ` Reason: ${managerNote}` : ''}`,
        metadata: { dropRequestId: drop.id },
      })
    }

    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

import { prisma } from './prisma'
import { emitToUser } from './sse'

export interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  message: string
  metadata?: Record<string, unknown>
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })

  // Push real-time notification via SSE
  try {
    emitToUser(input.userId, {
      type: 'notification',
      data: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
      },
    })
  } catch {
    // SSE not available, ignore
  }

  // Simulate email if the user has opted in
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, notificationPreference: true },
    })
    if (user?.notificationPreference === 'email') {
      simulateEmail(user.email, user.name, input.title, input.message)
    }
  } catch {
    // non-critical
  }

  return notification
}

// Simulated email — logs to console as a stand-in for a real email service
function simulateEmail(to: string, name: string, subject: string, body: string) {
  console.log(
    `\n📧 [EMAIL SIMULATION]\n` +
    `To: ${name} <${to}>\n` +
    `Subject: ${subject}\n` +
    `Body: ${body}\n` +
    `───────────────────────`
  )
}

export async function notifyShiftPublished(shiftId: string, locationName: string, date: string) {
  // Get all assignments for this shift
  const assignments = await prisma.shiftAssignment.findMany({
    where: { shiftId },
    include: { user: true },
  })

  for (const assignment of assignments) {
    await createNotification({
      userId: assignment.userId,
      type: 'shift_published',
      title: 'Shift Published',
      message: `Your shift at ${locationName} on ${date} has been published.`,
      metadata: { shiftId, locationName, date },
    })
  }
}

export async function notifySwapRequest(
  targetUserId: string,
  requesterName: string,
  shiftDate: string
) {
  await createNotification({
    userId: targetUserId,
    type: 'swap_request',
    title: 'Swap Request',
    message: `${requesterName} wants to swap a shift with you on ${shiftDate}.`,
    metadata: { requesterName, shiftDate },
  })
}

export async function notifySwapApproved(userId: string, shiftDate: string) {
  await createNotification({
    userId,
    type: 'swap_approved',
    title: 'Swap Approved',
    message: `Your shift swap for ${shiftDate} has been approved.`,
    metadata: { shiftDate },
  })
}

export async function notifyDropRequest(managerId: string, staffName: string, shiftDate: string) {
  await createNotification({
    userId: managerId,
    type: 'drop_request',
    title: 'Drop Request',
    message: `${staffName} has requested to drop their shift on ${shiftDate}.`,
    metadata: { staffName, shiftDate },
  })
}

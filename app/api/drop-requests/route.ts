import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'

// GET: list drop requests
// ?mine=true → drops I created
// ?available=true → open drops I can pick up (qualified + not expired)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mine = searchParams.get('mine') === 'true'
  const available = searchParams.get('available') === 'true'

  const isManager = ['admin', 'manager'].includes(session.user.role)

  if (available) {
    // Open drops the current user can potentially pick up
    const drops = await prisma.dropRequest.findMany({
      where: {
        status: 'open',
        expiresAt: { gt: new Date() },
        userId: { not: session.user.id }, // not their own drop
      },
      include: {
        assignment: {
          include: {
            shift: { include: { location: true, skill: true } },
            user: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    })

    // Filter to only shifts the user is qualified for
    const mySkills = await prisma.userSkill.findMany({
      where: { userId: session.user.id },
      select: { skillId: true },
    })
    const myLocations = await prisma.locationCertification.findMany({
      where: { userId: session.user.id },
      select: { locationId: true },
    })
    const skillIds = new Set(mySkills.map((s) => s.skillId))
    const locationIds = new Set(myLocations.map((l) => l.locationId))

    const qualified = drops.filter(
      (d) =>
        skillIds.has(d.assignment.shift.skillId) &&
        locationIds.has(d.assignment.shift.locationId)
    )

    return NextResponse.json(qualified)
  }

  if (mine) {
    const drops = await prisma.dropRequest.findMany({
      where: { userId: session.user.id },
      include: {
        assignment: {
          include: {
            shift: { include: { location: true, skill: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(drops)
  }

  // Managers see all drops needing approval (claimed status)
  if (isManager) {
    const drops = await prisma.dropRequest.findMany({
      where: { status: { in: ['open', 'claimed'] } },
      include: {
        assignment: {
          include: {
            shift: { include: { location: true, skill: true } },
            user: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(drops)
  }

  return NextResponse.json([])
}

// POST: staff creates a drop request for one of their assignments
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { assignmentId } = body

  if (!assignmentId) {
    return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })
  }

  // Verify ownership
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { shift: { include: { location: true, skill: true } } },
  })

  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  if (assignment.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not your assignment' }, { status: 403 })
  }

  // Check shift hasn't started
  const shiftStart = new Date(`${assignment.shift.date}T${assignment.shift.startTime}:00`)
  if (shiftStart <= new Date()) {
    return NextResponse.json({ error: 'Cannot drop a shift that has already started' }, { status: 400 })
  }

  // Check no existing open drop for this assignment
  const existing = await prisma.dropRequest.findFirst({
    where: { assignmentId, status: { in: ['open', 'claimed'] } },
  })
  if (existing) {
    return NextResponse.json({ error: 'An active drop request already exists for this shift' }, { status: 400 })
  }

  // Enforce max 3 pending requests (swaps + drops combined)
  const pendingSwaps = await prisma.swapRequest.count({
    where: { requesterId: session.user.id, status: { in: ['pending', 'accepted'] } },
  })
  const pendingDrops = await prisma.dropRequest.count({
    where: { userId: session.user.id, status: { in: ['open', 'claimed'] } },
  })
  if (pendingSwaps + pendingDrops >= 3) {
    return NextResponse.json(
      { error: 'You already have 3 pending swap/drop requests. Resolve existing requests before creating new ones.' },
      { status: 422 }
    )
  }

  // Expiry: 24 hours before shift start
  const expiresAt = new Date(shiftStart.getTime() - 24 * 60 * 60 * 1000)
  if (expiresAt <= new Date()) {
    return NextResponse.json(
      { error: 'Cannot create a drop request within 24 hours of shift start' },
      { status: 400 }
    )
  }

  const drop = await prisma.dropRequest.create({
    data: {
      assignmentId,
      userId: session.user.id,
      expiresAt,
      status: 'open',
    },
    include: {
      assignment: {
        include: { shift: { include: { location: true, skill: true } } },
      },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'create',
    entityType: 'dropRequest',
    entityId: drop.id,
    after: { assignmentId, expiresAt },
  })

  // Notify managers
  const managers = await prisma.locationManager.findMany({
    where: { locationId: assignment.shift.locationId },
    select: { userId: true },
  })
  for (const mgr of managers) {
    await createNotification({
      userId: mgr.userId,
      type: 'drop_request',
      title: 'Shift Drop Request',
      message: `${session.user.name} is dropping their ${assignment.shift.skill.name} shift at ${assignment.shift.location.name} on ${assignment.shift.date}.`,
      metadata: { dropRequestId: drop.id },
    })
  }

  return NextResponse.json(drop, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const locations = await prisma.location.findMany({
    include: {
      managers: { include: { user: true } },
      certifications: { include: { user: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(locations)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, address, timezone } = body

  if (!name || !address || !timezone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const location = await prisma.location.create({
    data: { name, address, timezone },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'create',
    entityType: 'location',
    entityId: location.id,
    after: { name, address, timezone },
  })

  return NextResponse.json(location, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, address, timezone } = body

  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
      ...(timezone ? { timezone } : {}),
    },
  })

  return NextResponse.json(location)
}

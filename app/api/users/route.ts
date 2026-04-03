import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get('locationId')
  const skillId = searchParams.get('skillId')
  const role = searchParams.get('role')

  // Managers can only see staff certified at their assigned locations
  let managerLocationFilter: { locationCertifications?: { some: { locationId: { in: string[] } } } } = {}
  if (session.user.role === 'manager') {
    const managed = await prisma.locationManager.findMany({
      where: { userId: session.user.id },
      select: { locationId: true },
    })
    const managedIds = managed.map((m) => m.locationId)
    managerLocationFilter = { locationCertifications: { some: { locationId: { in: managedIds } } } }
  }

  const users = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(locationId
        ? { locationCertifications: { some: { locationId } } }
        : managerLocationFilter),
      ...(skillId ? { skills: { some: { skillId } } } : {}),
    },
    include: {
      skills: { include: { skill: true } },
      locationCertifications: { include: { location: true } },
      availabilities: true,
      managedLocations: { include: { location: true } },
    },
    orderBy: { name: 'asc' },
  })

  // Don't return password hashes
  return NextResponse.json(
    users.map(({ passwordHash, ...user }) => user)
  )
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, role, password, desiredHours, skills, locationIds } = body

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: role || 'staff',
        passwordHash,
        desiredHours: desiredHours || 40,
        skills: skills
          ? {
              create: skills.map((skillId: string) => ({ skillId })),
            }
          : undefined,
        locationCertifications: locationIds
          ? {
              create: locationIds.map((locationId: string) => ({ locationId })),
            }
          : undefined,
      },
      include: {
        skills: { include: { skill: true } },
        locationCertifications: { include: { location: true } },
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      after: { email: user.email, name: user.name, role: user.role },
    })

    const { passwordHash: _, ...userWithoutPassword } = user
    return NextResponse.json(userWithoutPassword, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }
    throw error
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, name, desiredHours, skills, locationIds, availabilities } = body

  // Users can only edit themselves unless admin
  if (session.user.role !== 'admin' && session.user.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(desiredHours !== undefined ? { desiredHours } : {}),
      ...(skills !== undefined
        ? {
            skills: {
              deleteMany: {},
              create: skills.map((skillId: string) => ({ skillId })),
            },
          }
        : {}),
      ...(locationIds !== undefined && session.user.role === 'admin'
        ? {
            locationCertifications: {
              deleteMany: {},
              create: locationIds.map((locationId: string) => ({ locationId })),
            },
          }
        : {}),
      ...(availabilities !== undefined
        ? {
            availabilities: {
              deleteMany: {},
              create: availabilities,
            },
          }
        : {}),
    },
    include: {
      skills: { include: { skill: true } },
      locationCertifications: { include: { location: true } },
      availabilities: true,
    },
  })

  const { passwordHash: _, ...userWithoutPassword } = updatedUser
  return NextResponse.json(userWithoutPassword)
}

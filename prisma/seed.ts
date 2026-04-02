import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { format, addDays, startOfWeek } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Skills
  const skillNames = ['bartender', 'line_cook', 'server', 'host', 'busser', 'dishwasher']
  const skills: Record<string, string> = {}

  for (const name of skillNames) {
    const skill = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    skills[name] = skill.id
    console.log(`Skill: ${name} (${skill.id})`)
  }

  // Locations
  const locations = await Promise.all([
    prisma.location.upsert({
      where: { id: 'loc-downtown' },
      update: {},
      create: {
        id: 'loc-downtown',
        name: 'Downtown Coastal',
        address: '100 Broadway, New York, NY 10001',
        timezone: 'America/New_York',
      },
    }),
    prisma.location.upsert({
      where: { id: 'loc-harbor' },
      update: {},
      create: {
        id: 'loc-harbor',
        name: 'Harbor View',
        address: '200 Pier St, New York, NY 10004',
        timezone: 'America/New_York',
      },
    }),
    prisma.location.upsert({
      where: { id: 'loc-sunset' },
      update: {},
      create: {
        id: 'loc-sunset',
        name: 'Sunset Strip',
        address: '8000 Sunset Blvd, Los Angeles, CA 90046',
        timezone: 'America/Los_Angeles',
      },
    }),
    prisma.location.upsert({
      where: { id: 'loc-venice' },
      update: {},
      create: {
        id: 'loc-venice',
        name: 'Venice Beach',
        address: '1 Ocean Front Walk, Venice, CA 90291',
        timezone: 'America/Los_Angeles',
      },
    }),
  ])
  console.log(`Created ${locations.length} locations`)

  const [downtown, harbor, sunset, venice] = locations

  // Hash passwords
  const adminHash = await bcrypt.hash('admin123', 12)
  const managerHash = await bcrypt.hash('manager123', 12)
  const staffHash = await bcrypt.hash('staff123', 12)

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@coastaleats.com' },
    update: {},
    create: {
      email: 'admin@coastaleats.com',
      name: 'Admin User',
      role: 'admin',
      passwordHash: adminHash,
      desiredHours: 40,
    },
  })
  console.log(`Admin: ${admin.email}`)

  // Manager 1 - NY
  const sarah = await prisma.user.upsert({
    where: { email: 'sarah.manager@coastaleats.com' },
    update: {},
    create: {
      email: 'sarah.manager@coastaleats.com',
      name: 'Sarah Chen',
      role: 'manager',
      passwordHash: managerHash,
      desiredHours: 40,
    },
  })

  // Manager 2 - LA
  const mike = await prisma.user.upsert({
    where: { email: 'mike.manager@coastaleats.com' },
    update: {},
    create: {
      email: 'mike.manager@coastaleats.com',
      name: 'Mike Rodriguez',
      role: 'manager',
      passwordHash: managerHash,
      desiredHours: 40,
    },
  })

  // Add location managers
  await prisma.locationManager.upsert({
    where: { userId_locationId: { userId: sarah.id, locationId: downtown.id } },
    update: {},
    create: { userId: sarah.id, locationId: downtown.id },
  })
  await prisma.locationManager.upsert({
    where: { userId_locationId: { userId: sarah.id, locationId: harbor.id } },
    update: {},
    create: { userId: sarah.id, locationId: harbor.id },
  })
  await prisma.locationManager.upsert({
    where: { userId_locationId: { userId: mike.id, locationId: sunset.id } },
    update: {},
    create: { userId: mike.id, locationId: sunset.id },
  })
  await prisma.locationManager.upsert({
    where: { userId_locationId: { userId: mike.id, locationId: venice.id } },
    update: {},
    create: { userId: mike.id, locationId: venice.id },
  })

  // Staff members with various skills and certifications
  const staffData = [
    {
      email: 'alex.johnson@coastaleats.com',
      name: 'Alex Johnson',
      skills: ['server', 'host', 'busser'],
      locations: [downtown.id, harbor.id],
      desiredHours: 35,
      availability: [1, 2, 3, 4, 5], // Mon-Fri
    },
    {
      email: 'maria.garcia@coastaleats.com',
      name: 'Maria Garcia',
      skills: ['bartender', 'server'],
      locations: [downtown.id, harbor.id, sunset.id],
      desiredHours: 40,
      availability: [0, 1, 2, 3, 4, 5, 6], // All week
    },
    {
      email: 'james.wilson@coastaleats.com',
      name: 'James Wilson',
      skills: ['line_cook', 'dishwasher'],
      locations: [downtown.id],
      desiredHours: 40,
      availability: [1, 2, 3, 4, 5, 6],
    },
    {
      email: 'emily.davis@coastaleats.com',
      name: 'Emily Davis',
      skills: ['server', 'host'],
      locations: [harbor.id, downtown.id],
      desiredHours: 30,
      availability: [3, 4, 5, 6, 0], // Thu-Sun
    },
    {
      email: 'chris.martinez@coastaleats.com',
      name: 'Chris Martinez',
      skills: ['bartender', 'server'],
      locations: [sunset.id, venice.id],
      desiredHours: 40,
      availability: [1, 2, 3, 4, 5, 6, 0],
    },
    {
      email: 'lisa.anderson@coastaleats.com',
      name: 'Lisa Anderson',
      skills: ['host', 'server', 'busser'],
      locations: [venice.id, sunset.id],
      desiredHours: 25,
      availability: [5, 6, 0], // Fri-Sun
    },
    {
      email: 'ryan.taylor@coastaleats.com',
      name: 'Ryan Taylor',
      skills: ['line_cook', 'dishwasher'],
      locations: [sunset.id, venice.id],
      desiredHours: 40,
      availability: [1, 2, 3, 4, 5, 6],
    },
    {
      email: 'jessica.thomas@coastaleats.com',
      name: 'Jessica Thomas',
      skills: ['server', 'bartender', 'host'],
      locations: [downtown.id, sunset.id], // Cross-timezone certified
      desiredHours: 40,
      availability: [1, 2, 3, 4, 5, 6, 0],
    },
    {
      email: 'kevin.white@coastaleats.com',
      name: 'Kevin White',
      skills: ['dishwasher', 'busser', 'line_cook'],
      locations: [harbor.id, venice.id],
      desiredHours: 35,
      availability: [2, 3, 4, 5, 6, 0], // Tue-Sun
    },
    {
      email: 'ashley.harris@coastaleats.com',
      name: 'Ashley Harris',
      skills: ['bartender', 'server'],
      locations: [downtown.id, harbor.id, sunset.id, venice.id], // All locations
      desiredHours: 40,
      availability: [1, 2, 3, 4, 5, 6, 0],
    },
    {
      email: 'daniel.clark@coastaleats.com',
      name: 'Daniel Clark',
      skills: ['line_cook'],
      locations: [harbor.id, sunset.id],
      desiredHours: 40,
      availability: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      email: 'amanda.lewis@coastaleats.com',
      name: 'Amanda Lewis',
      skills: ['host', 'server'],
      locations: [venice.id, downtown.id],
      desiredHours: 30,
      availability: [1, 3, 5, 6, 0], // Mon, Wed, Fri-Sun
    },
  ]

  const staffUsers: Record<string, string> = {}

  for (const staff of staffData) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        email: staff.email,
        name: staff.name,
        role: 'staff',
        passwordHash: staffHash,
        desiredHours: staff.desiredHours,
      },
    })
    staffUsers[staff.email] = user.id

    // Add skills
    for (const skillName of staff.skills) {
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: user.id, skillId: skills[skillName] } },
        update: {},
        create: { userId: user.id, skillId: skills[skillName] },
      })
    }

    // Add location certifications
    for (const locationId of staff.locations) {
      await prisma.locationCertification.upsert({
        where: { userId_locationId: { userId: user.id, locationId } },
        update: {},
        create: { userId: user.id, locationId },
      })
    }

    // Add availability
    for (const day of staff.availability) {
      const existing = await prisma.availability.findFirst({
        where: { userId: user.id, dayOfWeek: day },
      })
      if (!existing) {
        await prisma.availability.create({
          data: {
            userId: user.id,
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '22:00',
          },
        })
      }
    }

    console.log(`Staff: ${staff.name} (${staff.email})`)
  }

  // Also add manager certifications
  for (const locId of [downtown.id, harbor.id]) {
    await prisma.locationCertification.upsert({
      where: { userId_locationId: { userId: sarah.id, locationId: locId } },
      update: {},
      create: { userId: sarah.id, locationId: locId },
    })
    for (const skillName of skillNames) {
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: sarah.id, skillId: skills[skillName] } },
        update: {},
        create: { userId: sarah.id, skillId: skills[skillName] },
      })
    }
  }
  for (const locId of [sunset.id, venice.id]) {
    await prisma.locationCertification.upsert({
      where: { userId_locationId: { userId: mike.id, locationId: locId } },
      update: {},
      create: { userId: mike.id, locationId: locId },
    })
    for (const skillName of skillNames) {
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: mike.id, skillId: skills[skillName] } },
        update: {},
        create: { userId: mike.id, skillId: skills[skillName] },
      })
    }
  }

  // Create shifts for current week and next week
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })

  // Helper to create a shift
  async function createShiftWithAssignment(
    locationId: string,
    skillName: string,
    date: Date,
    startTime: string,
    endTime: string,
    headcount: number,
    status: 'draft' | 'published',
    assignedUserEmails: string[] = []
  ) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const shift = await prisma.shift.create({
      data: {
        locationId,
        skillId: skills[skillName],
        date: dateStr,
        startTime,
        endTime,
        headcount,
        status,
        publishedAt: status === 'published' ? new Date() : null,
      },
    })

    for (const email of assignedUserEmails) {
      const userId = staffUsers[email] || (email === sarah.email ? sarah.id : mike.id)
      if (userId) {
        await prisma.shiftAssignment.create({
          data: { shiftId: shift.id, userId },
        })
      }
    }

    return shift
  }

  // Current week shifts
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = addDays(weekStart, dayOffset)

    // Downtown Coastal - NY
    await createShiftWithAssignment(
      downtown.id, 'server', day, '10:00', '16:00', 2, 'published',
      dayOffset < 3 ? ['alex.johnson@coastaleats.com', 'emily.davis@coastaleats.com'] :
      dayOffset < 5 ? ['alex.johnson@coastaleats.com'] : []
    )
    await createShiftWithAssignment(
      downtown.id, 'bartender', day, '16:00', '23:00', 1, 'published',
      dayOffset % 2 === 0 ? ['maria.garcia@coastaleats.com'] : ['ashley.harris@coastaleats.com']
    )
    await createShiftWithAssignment(
      downtown.id, 'line_cook', day, '09:00', '17:00', 1,
      dayOffset < 2 ? 'published' : 'draft',
      dayOffset < 2 ? ['james.wilson@coastaleats.com'] : []
    )

    // Harbor View - NY
    await createShiftWithAssignment(
      harbor.id, 'server', day, '11:00', '19:00', 2, 'published',
      dayOffset < 4 ? ['emily.davis@coastaleats.com', 'jessica.thomas@coastaleats.com'] :
      ['jessica.thomas@coastaleats.com']
    )
    await createShiftWithAssignment(
      harbor.id, 'host', day, '11:00', '19:00', 1, 'published',
      dayOffset < 5 ? ['alex.johnson@coastaleats.com'] : []
    )

    // Sunset Strip - LA
    await createShiftWithAssignment(
      sunset.id, 'server', day, '10:00', '18:00', 2, 'published',
      dayOffset < 3 ? ['chris.martinez@coastaleats.com', 'jessica.thomas@coastaleats.com'] :
      dayOffset < 6 ? ['chris.martinez@coastaleats.com'] : []
    )
    await createShiftWithAssignment(
      sunset.id, 'bartender', day, '18:00', '02:00', 1,
      dayOffset < 3 ? 'published' : 'draft',
      dayOffset < 3 ? ['ashley.harris@coastaleats.com'] : []
    )

    // Venice Beach - LA
    await createShiftWithAssignment(
      venice.id, 'server', day, '09:00', '15:00', 2, 'published',
      dayOffset < 4 ? ['lisa.anderson@coastaleats.com', 'amanda.lewis@coastaleats.com'] :
      ['amanda.lewis@coastaleats.com']
    )
    await createShiftWithAssignment(
      venice.id, 'host', day, '09:00', '15:00', 1, 'published',
      dayOffset < 6 ? ['lisa.anderson@coastaleats.com'] : []
    )
  }

  // Next week shifts
  const nextWeekStart = addDays(weekStart, 7)
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = addDays(nextWeekStart, dayOffset)

    await createShiftWithAssignment(
      downtown.id, 'server', day, '10:00', '16:00', 2,
      dayOffset < 4 ? 'published' : 'draft',
      dayOffset < 2 ? ['alex.johnson@coastaleats.com'] : []
    )
    await createShiftWithAssignment(
      downtown.id, 'bartender', day, '16:00', '23:00', 1, 'draft', []
    )
    await createShiftWithAssignment(
      harbor.id, 'server', day, '11:00', '19:00', 2, 'draft', []
    )
    await createShiftWithAssignment(
      sunset.id, 'server', day, '10:00', '18:00', 2,
      dayOffset < 3 ? 'published' : 'draft',
      dayOffset < 2 ? ['chris.martinez@coastaleats.com'] : []
    )
    await createShiftWithAssignment(
      venice.id, 'host', day, '09:00', '15:00', 1, 'draft', []
    )
  }

  // Create an overtime situation for Ryan Taylor (add many shifts this week)
  console.log('Creating overtime situation for Ryan Taylor...')
  const ryanId = staffUsers['ryan.taylor@coastaleats.com']
  if (ryanId) {
    // Ryan already has some shifts; let's add extra ones to push him toward overtime
    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const day = addDays(weekStart, dayOffset)
      try {
        const shift = await prisma.shift.create({
          data: {
            locationId: sunset.id,
            skillId: skills['line_cook'],
            date: format(day, 'yyyy-MM-dd'),
            startTime: '09:00',
            endTime: '17:00',
            headcount: 1,
            status: 'published',
            publishedAt: new Date(),
          },
        })
        await prisma.shiftAssignment.create({
          data: { shiftId: shift.id, userId: ryanId },
        })
      } catch {
        // might already exist
      }
    }
  }

  // Create a pending swap request
  console.log('Creating sample swap request...')
  const alexId = staffUsers['alex.johnson@coastaleats.com']
  const emilyId = staffUsers['emily.davis@coastaleats.com']

  if (alexId && emilyId) {
    const alexShift = await prisma.shiftAssignment.findFirst({
      where: { userId: alexId },
    })

    if (alexShift) {
      await prisma.swapRequest.create({
        data: {
          requesterId: alexId,
          targetId: emilyId,
          sourceAssignmentId: alexShift.id,
          shiftId: alexShift.shiftId,
          type: 'swap',
          status: 'pending',
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      })
    }
  }

  // Create sample notifications
  console.log('Creating sample notifications...')
  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: 'system',
        title: 'Welcome to ShiftSync',
        message: 'Your scheduling platform is set up and ready to use.',
        read: false,
      },
      ...(alexId ? [{
        userId: alexId,
        type: 'shift_published',
        title: 'Shift Published',
        message: 'Your server shift at Downtown Coastal has been published.',
        read: false,
      }] : []),
    ],
  })

  console.log('\nSeed completed successfully!')
  console.log('\nTest Accounts:')
  console.log('Admin: admin@coastaleats.com / admin123')
  console.log('Manager (NY): sarah.manager@coastaleats.com / manager123')
  console.log('Manager (LA): mike.manager@coastaleats.com / manager123')
  console.log('Staff: alex.johnson@coastaleats.com / staff123')
  console.log('Staff: chris.martinez@coastaleats.com / staff123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { prisma } from './prisma'
import { timeToMinutes, shiftDurationHours, timesOverlap, getWeekStart, convertTime } from './timezone'
import { parseISO, addDays, subDays, format } from 'date-fns'

export interface ConflictResult {
  hasConflict: boolean
  message?: string
  details?: Record<string, unknown>
}

export interface OvertimeResult {
  totalHours: number
  isWarning: boolean // 35+
  isOvertime: boolean // 40+
  message?: string
}

export interface ConsecutiveDaysResult {
  consecutiveDays: number
  isWarning: boolean // 6+
  isViolation: boolean // 7+
}

export interface StaffSuggestion {
  user: { id: string; name: string; email: string }
  score: number
  violations: string[]
}

/**
 * Check if a user is double-booked for a given shift time slot
 */
export async function checkDoubleBooking(
  userId: string,
  excludeShiftId: string | null,
  date: string,
  startTime: string,
  endTime: string,
  locationTimezone: string
): Promise<ConflictResult> {
  // Get all assignments for this user on this date
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'no_show' },
      shift: {
        date,
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      },
    },
    include: { shift: { include: { location: true } } },
  })

  for (const assignment of assignments) {
    const shift = assignment.shift
    // Convert times to same timezone for comparison
    const shiftStart = shift.startTime
    const shiftEnd = shift.endTime

    if (timesOverlap(startTime, endTime, shiftStart, shiftEnd)) {
      return {
        hasConflict: true,
        message: `User is already assigned to a shift from ${shiftStart} to ${shiftEnd} at ${shift.location.name}`,
        details: { conflictingShiftId: shift.id },
      }
    }
  }

  return { hasConflict: false }
}

/**
 * Check minimum 8-hour rest period between shifts
 */
export async function checkMinRestPeriod(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string
): Promise<ConflictResult> {
  const MIN_REST_HOURS = 10

  // Check previous day and same day for nearby shifts
  const prevDate = format(subDays(parseISO(date), 1), 'yyyy-MM-dd')
  const nextDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'no_show' },
      shift: {
        date: { in: [prevDate, date, nextDate] },
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      },
    },
    include: { shift: true },
  })

  const newStart = timeToMinutes(startTime)
  let newEnd = timeToMinutes(endTime)
  if (newEnd <= newStart) newEnd += 24 * 60

  for (const assignment of assignments) {
    const shift = assignment.shift
    const shiftStart = timeToMinutes(shift.startTime)
    let shiftEnd = timeToMinutes(shift.endTime)
    if (shiftEnd <= shiftStart) shiftEnd += 24 * 60

    // Convert to absolute minutes relative to today
    const dateDiff =
      shift.date === prevDate ? -24 * 60 : shift.date === nextDate ? 24 * 60 : 0

    const absShiftStart = shiftStart + dateDiff
    const absShiftEnd = shiftEnd + dateDiff
    const absNewStart = newStart
    const absNewEnd = newEnd

    // Check gap between end of one and start of other
    const gap1 = absNewStart - absShiftEnd // gap after existing shift
    const gap2 = absShiftStart - absNewEnd // gap after new shift

    if (gap1 >= 0 && gap1 < MIN_REST_HOURS * 60) {
      return {
        hasConflict: true,
        message: `Less than ${MIN_REST_HOURS} hours rest between shifts. Only ${Math.round(gap1 / 60 * 10) / 10} hours gap.`,
      }
    }
    if (gap2 >= 0 && gap2 < MIN_REST_HOURS * 60) {
      return {
        hasConflict: true,
        message: `Less than ${MIN_REST_HOURS} hours rest between shifts. Only ${Math.round(gap2 / 60 * 10) / 10} hours gap.`,
      }
    }
  }

  return { hasConflict: false }
}

/**
 * Check if user has the required skill for a shift
 */
export async function checkSkillMatch(userId: string, skillId: string): Promise<boolean> {
  const skill = await prisma.userSkill.findUnique({
    where: { userId_skillId: { userId, skillId } },
  })
  return !!skill
}

/**
 * Check if user is certified to work at a location
 */
export async function checkLocationCertification(
  userId: string,
  locationId: string
): Promise<boolean> {
  const cert = await prisma.locationCertification.findUnique({
    where: { userId_locationId: { userId, locationId } },
  })
  return !!cert
}

/**
 * Check user availability for a given shift.
 *
 * Design decision: availability windows are stored in the staff member's
 * "home timezone", inferred as the timezone of their first certified location
 * (ordered alphabetically by location name for determinism). This means a staff
 * member who sets "09:00–17:00" is saying "9am–5pm in my home timezone."
 *
 * Shift times are stored in the shift's location timezone. When the shift is at
 * a different location (and therefore a different timezone), we convert the shift
 * start/end into the staff member's home timezone before comparing against their
 * availability window. The day-of-week check also uses the converted date so that
 * overnight timezone crossings are handled correctly.
 */
export async function checkAvailability(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  locationTimezone: string
): Promise<ConflictResult> {
  // Determine the staff member's home timezone from their first certified location
  const firstCert = await prisma.locationCertification.findFirst({
    where: { userId },
    include: { location: true },
    orderBy: { location: { name: 'asc' } },
  })
  const staffTimezone = firstCert?.location.timezone ?? locationTimezone

  // Convert shift start/end from the shift's location timezone to the staff's home timezone
  const convertedStart = convertTime(date, startTime, locationTimezone, staffTimezone)
  const convertedEnd = convertTime(date, endTime, locationTimezone, staffTimezone)

  // Use the converted date for day-of-week (handles midnight crossings)
  const effectiveDate = convertedStart.date
  const effectiveStartTime = convertedStart.time
  const effectiveEndTime = convertedEnd.time

  // Check for exceptions first (keyed on the date in the staff's home timezone)
  const exception = await prisma.availabilityException.findFirst({
    where: { userId, date: effectiveDate },
  })

  if (exception) {
    if (!exception.isAvailable) {
      if (!exception.startTime && !exception.endTime) {
        return {
          hasConflict: true,
          message: `User is not available on ${effectiveDate} (day-off exception)`,
        }
      }
      if (exception.startTime && exception.endTime) {
        if (timesOverlap(effectiveStartTime, effectiveEndTime, exception.startTime, exception.endTime)) {
          return {
            hasConflict: true,
            message: `User has marked themselves unavailable from ${exception.startTime} to ${exception.endTime} on ${effectiveDate}`,
          }
        }
      }
    }
  }

  // Check regular availability using the day-of-week in staff's home timezone
  const dayOfWeek = parseISO(effectiveDate).getDay()
  const availability = await prisma.availability.findFirst({
    where: { userId, dayOfWeek },
  })

  if (!availability) {
    return {
      hasConflict: true,
      message: `User has no availability set for ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]} (in their home timezone: ${staffTimezone})`,
    }
  }

  // Compare shift times (now in staff's home timezone) against availability window
  const availStart = timeToMinutes(availability.startTime)
  const availEnd = timeToMinutes(availability.endTime)
  const shiftStart = timeToMinutes(effectiveStartTime)
  const shiftEnd = timeToMinutes(effectiveEndTime)

  // Handle overnight shifts after conversion
  const normalizedShiftEnd = shiftEnd <= shiftStart ? shiftEnd + 24 * 60 : shiftEnd

  if (shiftStart < availStart || normalizedShiftEnd > availEnd) {
    const tzNote = staffTimezone !== locationTimezone
      ? ` (shift converted from ${locationTimezone} to staff's home timezone ${staffTimezone}: ${effectiveStartTime}–${effectiveEndTime})`
      : ''
    return {
      hasConflict: true,
      message: `Shift is outside user's availability window (${availability.startTime}–${availability.endTime})${tzNote}`,
    }
  }

  return { hasConflict: false }
}

/**
 * Check daily hours for overtime
 */
export async function checkDailyHours(
  userId: string,
  date: string,
  addHours: number = 0
): Promise<OvertimeResult> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'no_show' },
      shift: { date },
    },
    include: { shift: true },
  })

  let totalHours = addHours
  for (const a of assignments) {
    totalHours += shiftDurationHours(a.shift.startTime, a.shift.endTime)
  }

  return {
    totalHours,
    isWarning: totalHours >= 8,
    isOvertime: totalHours >= 12,
    message:
      totalHours >= 12
        ? `${totalHours.toFixed(1)} daily hours exceeds 12-hour limit`
        : totalHours >= 8
        ? `${totalHours.toFixed(1)} daily hours approaching 12-hour limit`
        : undefined,
  }
}

/**
 * Check weekly hours for overtime
 */
export async function checkWeeklyHours(
  userId: string,
  weekStart: string,
  addHours: number = 0
): Promise<OvertimeResult> {
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: 'no_show' },
      shift: {
        date: { gte: weekStart, lte: weekEnd },
      },
    },
    include: { shift: true },
  })

  let totalHours = addHours
  for (const a of assignments) {
    totalHours += shiftDurationHours(a.shift.startTime, a.shift.endTime)
  }

  return {
    totalHours,
    isWarning: totalHours >= 35,
    isOvertime: totalHours >= 40,
    message:
      totalHours >= 40
        ? `${totalHours.toFixed(1)} weekly hours exceeds 40-hour limit`
        : totalHours >= 35
        ? `${totalHours.toFixed(1)} weekly hours approaching 40-hour limit`
        : undefined,
  }
}

/**
 * Check consecutive working days
 */
export async function checkConsecutiveDays(
  userId: string,
  date: string
): Promise<ConsecutiveDaysResult> {
  // Look back up to 7 days
  let consecutiveDays = 0
  let checkDate = date

  for (let i = 0; i < 14; i++) {
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        userId,
        status: { not: 'no_show' },
        shift: { date: checkDate },
      },
    })

    if (assignments.length > 0) {
      consecutiveDays++
      checkDate = format(subDays(parseISO(checkDate), 1), 'yyyy-MM-dd')
    } else {
      break
    }
  }

  // Also look forward
  checkDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
  for (let i = 0; i < 7; i++) {
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        userId,
        status: { not: 'no_show' },
        shift: { date: checkDate },
      },
    })

    if (assignments.length > 0) {
      consecutiveDays++
      checkDate = format(addDays(parseISO(checkDate), 1), 'yyyy-MM-dd')
    } else {
      break
    }
  }

  return {
    consecutiveDays,
    isWarning: consecutiveDays >= 6,
    isViolation: consecutiveDays >= 7,
  }
}

/**
 * Run all constraint checks for assigning a user to a shift
 */
export async function runConstraintChecks(
  userId: string,
  shiftId: string
): Promise<{
  canAssign: boolean
  violations: string[]
  warnings: string[]
  requiresOverrideReason: boolean  // true when 7th consecutive day
}> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, skill: true },
  })

  if (!shift) return { canAssign: false, violations: ['Shift not found'], warnings: [], requiresOverrideReason: false }

  const violations: string[] = []
  const warnings: string[] = []

  // 1. Skill check
  const hasSkill = await checkSkillMatch(userId, shift.skillId)
  if (!hasSkill) {
    violations.push(`User does not have required skill: ${shift.skill.name}`)
  }

  // 2. Location certification
  const hasCert = await checkLocationCertification(userId, shift.locationId)
  if (!hasCert) {
    violations.push(`User is not certified for location: ${shift.location.name}`)
  }

  // 3. Double booking
  const doubleBook = await checkDoubleBooking(
    userId,
    shiftId,
    shift.date,
    shift.startTime,
    shift.endTime,
    shift.location.timezone
  )
  if (doubleBook.hasConflict) {
    violations.push(doubleBook.message!)
  }

  // 4. Rest period
  const restPeriod = await checkMinRestPeriod(userId, shift.date, shift.startTime, shift.endTime, shiftId)
  if (restPeriod.hasConflict) {
    warnings.push(restPeriod.message!)
  }

  // 5. Availability
  const avail = await checkAvailability(
    userId,
    shift.date,
    shift.startTime,
    shift.endTime,
    shift.location.timezone
  )
  if (avail.hasConflict) {
    warnings.push(avail.message!)
  }

  // 6. Weekly hours
  const weekStart = getWeekStart(shift.date)
  const newHours = shiftDurationHours(shift.startTime, shift.endTime)
  const weeklyHours = await checkWeeklyHours(userId, weekStart, newHours)
  if (weeklyHours.isOvertime) {
    violations.push(weeklyHours.message!)
  } else if (weeklyHours.isWarning) {
    warnings.push(weeklyHours.message!)
  }

  // 7. Consecutive days
  const consecutive = await checkConsecutiveDays(userId, shift.date)
  let requiresOverrideReason = false
  if (consecutive.isViolation) {
    // 7th consecutive day: blocks unless manager provides override reason
    violations.push(`This would be ${consecutive.consecutiveDays} consecutive working days. A documented reason is required.`)
    requiresOverrideReason = true
  } else if (consecutive.isWarning) {
    warnings.push(`${consecutive.consecutiveDays} consecutive working days (6th day warning).`)
  }

  return {
    canAssign: violations.length === 0,
    violations,
    warnings,
    requiresOverrideReason,
  }
}

/**
 * Get suggested staff for a shift based on constraint compliance
 */
export async function getSuggestedAlternatives(shiftId: string): Promise<StaffSuggestion[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, skill: true },
  })

  if (!shift) return []

  // Get users with the required skill and location certification
  const eligibleUsers = await prisma.user.findMany({
    where: {
      role: { in: ['staff', 'manager'] },
      skills: { some: { skillId: shift.skillId } },
      locationCertifications: { some: { locationId: shift.locationId } },
      // Not already assigned to this shift
      shiftAssignments: { none: { shiftId } },
    },
    include: {
      skills: true,
      locationCertifications: true,
    },
  })

  const suggestions: StaffSuggestion[] = []

  for (const user of eligibleUsers) {
    const checks = await runConstraintChecks(user.id, shiftId)
    const score = 100 - checks.violations.length * 30 - checks.warnings.length * 10

    suggestions.push({
      user: { id: user.id, name: user.name, email: user.email },
      score: Math.max(0, score),
      violations: [...checks.violations, ...checks.warnings],
    })
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 10)
}

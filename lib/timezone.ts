import { format, parseISO, addMinutes } from 'date-fns'
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function shiftDurationHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime)
  let end = timeToMinutes(endTime)
  if (end <= start) end += 24 * 60 // handle overnight
  return (end - start) / 60
}

/**
 * Convert a date+time string from one timezone to another
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM' }
 */
export function convertTime(
  date: string,
  time: string,
  fromTimezone: string,
  toTimezone: string
): { date: string; time: string } {
  const dt = parseISO(`${date}T${time}:00`)
  const zonedFrom = fromZonedTime(dt, fromTimezone)
  const zonedTo = toZonedTime(zonedFrom, toTimezone)
  return {
    date: format(zonedTo, 'yyyy-MM-dd'),
    time: format(zonedTo, 'HH:mm'),
  }
}

/**
 * Get current date in a timezone as YYYY-MM-DD
 */
export function getCurrentDateInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd')
}

/**
 * Get Monday of the week containing the given date (YYYY-MM-DD)
 */
export function getWeekStart(date: string): string {
  const d = parseISO(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = addMinutes(d, diff * 24 * 60)
  return format(monday, 'yyyy-MM-dd')
}

/**
 * Check if two time ranges overlap
 */
export function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = timeToMinutes(start1)
  let e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  let e2 = timeToMinutes(end2)

  if (e1 <= s1) e1 += 24 * 60
  if (e2 <= s2) e2 += 24 * 60

  return s1 < e2 && s2 < e1
}

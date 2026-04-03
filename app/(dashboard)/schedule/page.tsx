'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'
import { useSession } from 'next-auth/react'

interface Shift {
  id: string
  locationId: string
  skillId: string
  date: string
  startTime: string
  endTime: string
  headcount: number
  status: 'draft' | 'published'
  location: { id: string; name: string; timezone: string }
  skill: { id: string; name: string }
  assignments: Array<{
    id: string
    status: string
    user: { id: string; name: string; email: string }
  }>
}

interface Location {
  id: string
  name: string
  timezone: string
}

interface Skill {
  id: string
  name: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
  skills: Array<{ skill: { id: string; name: string } }>
  locationCertifications: Array<{ location: { id: string; name: string } }>
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
  const { data: session } = useSession()
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [shifts, setShifts] = useState<Shift[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState<Shift | null>(null)
  const [showSwapModal, setShowSwapModal] = useState<{ shift: Shift; assignmentId: string } | null>(null)
  const [constraintWarning, setConstraintWarning] = useState<any>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [overrideReason, setOverrideReason] = useState('')
  const [staffHours, setStaffHours] = useState<Record<string, number>>({})
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const isManager = session && ['admin', 'manager'].includes(session.user.role)

  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  )
  const startDate = format(currentWeekStart, 'yyyy-MM-dd')
  const endDate = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd')

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedLocation ? { locationId: selectedLocation } : {}),
        ...(!isManager ? { userId: session?.user.id || '' } : {}),
      })
      const res = await fetch(`/api/shifts?${params}`)
      if (res.ok) setShifts(await res.json())
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, selectedLocation, isManager, session?.user.id])

  useEffect(() => {
    fetchShifts()
  }, [fetchShifts])

  useEffect(() => {
    Promise.all([
      fetch('/api/locations').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ]).then(([locs, usrs]) => {
      setLocations(locs)
      setUsers(usrs)
      // Extract unique skills
      const skillMap = new Map<string, Skill>()
      usrs.forEach((u: User) =>
        u.skills?.forEach(({ skill }: any) => skillMap.set(skill.id, skill))
      )
    })

    fetch('/api/users').then((r) => r.json()).then((usrs) => {
      setUsers(usrs)
      const skillMap = new Map<string, Skill>()
      usrs.forEach((u: User) =>
        u.skills?.forEach(({ skill }: any) => skillMap.set(skill.id, skill))
      )
      setSkills(Array.from(skillMap.values()))
    })
  }, [])

  const getShiftsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter((s) => s.date === dateStr)
  }

  const getShiftColor = (shift: Shift) => {
    if (shift.status === 'draft') return 'bg-gray-100 border-gray-300 text-gray-700'
    if (shift.assignments.length < shift.headcount) return 'bg-yellow-50 border-yellow-300 text-yellow-800'
    return 'bg-blue-50 border-blue-300 text-blue-800'
  }

  async function openAssignModal(shift: Shift) {
    setShowAssignModal(shift)
    setConstraintWarning(null)
    setOverrideReason('')
    setSuggestions([])
    setLoadingSuggestions(true)

    // Auto-load suggestions and current weekly hours in parallel
    const weekStart = format(startOfWeek(parseISO(shift.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const qualifiedUserIds = users
      .filter(u =>
        u.role !== 'admin' &&
        !shift.assignments.find(a => a.user.id === u.id) &&
        u.skills?.some((s: any) => s.skill.id === shift.skill.id) &&
        u.locationCertifications?.some((lc: any) => lc.location.id === shift.locationId)
      )
      .map(u => u.id)

    const [suggestionsRes, hoursRes] = await Promise.all([
      fetch(`/api/shifts/${shift.id}/assign`),
      qualifiedUserIds.length > 0
        ? fetch(`/api/analytics/staff-hours?weekStart=${weekStart}&userIds=${qualifiedUserIds.join(',')}`)
        : Promise.resolve(null),
    ])

    if (suggestionsRes.ok) setSuggestions(await suggestionsRes.json())
    if (hoursRes?.ok) setStaffHours(await hoursRes.json())
    setLoadingSuggestions(false)
  }

  async function handlePublish(shiftId: string) {
    const res = await fetch(`/api/shifts/${shiftId}/publish`, { method: 'POST' })
    if (res.ok) fetchShifts()
  }

  async function handleDelete(shiftId: string) {
    if (!confirm('Delete this shift?')) return
    await fetch(`/api/shifts/${shiftId}`, { method: 'DELETE' })
    fetchShifts()
  }

  async function handleAssign(shiftId: string, userId: string) {
    const res = await fetch(`/api/shifts/${shiftId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (res.status === 422) {
      setConstraintWarning({ ...data, shiftId, userId })
      setSuggestions(data.suggestions || [])
      return
    }
    if (res.ok) {
      setShowAssignModal(null)
      setConstraintWarning(null)
      fetchShifts()
    }
  }

  async function handleAssignOverride(shiftId: string, userId: string) {
    const res = await fetch(`/api/shifts/${shiftId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, override: true, overrideReason }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowAssignModal(null)
      setConstraintWarning(null)
      setOverrideReason('')
      fetchShifts()
    } else if (data.requiresOverrideReason) {
      // Server rejected — reason was blank; keep modal open so user can fill it
      setConstraintWarning((prev: any) => ({ ...prev, reasonError: true }))
    }
  }

  async function handleUnassign(shiftId: string, userId: string) {
    if (!confirm('Remove this staff member from the shift?')) return
    await fetch(`/api/shifts/${shiftId}/assign?userId=${userId}`, { method: 'DELETE' })
    fetchShifts()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-500 text-sm">
            Week of {format(currentWeekStart, 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              &larr;
            </button>
            <button
              onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              &rarr;
            </button>
          </div>

          {isManager && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + New Shift
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-200 border border-gray-300"></span> Draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Understaffed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span> Published
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`p-3 text-center border-r border-gray-200 last:border-r-0 ${
                format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  ? 'bg-blue-50'
                  : ''
              }`}
            >
              <p className="text-xs text-gray-500 font-medium">{DAYS_OF_WEEK[i]}</p>
              <p
                className={`text-lg font-bold mt-0.5 ${
                  format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    ? 'text-blue-600'
                    : 'text-gray-900'
                }`}
              >
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        {/* Shift rows */}
        <div className="grid grid-cols-7 min-h-[400px]">
          {weekDays.map((day, i) => {
            const dayShifts = getShiftsForDay(day)
            return (
              <div
                key={i}
                className="border-r border-gray-200 last:border-r-0 p-2 space-y-2 min-h-[120px]"
              >
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-14 bg-gray-100 rounded"></div>
                  </div>
                ) : (
                  dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className={`border rounded-lg p-2 text-xs cursor-pointer hover:shadow-md transition-shadow ${getShiftColor(shift)}`}
                      onClick={() => isManager && openAssignModal(shift)}
                    >
                      <div className="font-semibold truncate">{shift.location.name}</div>
                      <div className="text-xs opacity-80">{shift.skill.name}</div>
                      <div className="text-xs mt-0.5">
                        {shift.startTime} - {shift.endTime}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs">
                          {shift.assignments.length}/{shift.headcount} staff
                        </span>
                        {shift.assignments.length >= shift.headcount &&
                          shift.status === 'published' && (
                            <span className="text-green-600">✓</span>
                          )}
                      </div>
                      {isManager && (
                        <div className="flex gap-1 mt-1.5">
                          {shift.status === 'draft' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePublish(shift.id) }}
                              className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-200"
                            >
                              Publish
                            </button>
                          )}
                          {shift.status === 'draft' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(shift.id) }}
                              className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded hover:bg-red-200"
                            >
                              Del
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && isManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Manage Shift</h2>
                  <p className="text-sm text-gray-500">
                    {showAssignModal.location.name} - {showAssignModal.date} |{' '}
                    {showAssignModal.startTime} - {showAssignModal.endTime}
                  </p>
                  <p className="text-sm text-gray-500">
                    Skill: {showAssignModal.skill.name} | Status:{' '}
                    <span
                      className={`font-medium ${
                        showAssignModal.status === 'published' ? 'text-green-600' : 'text-yellow-600'
                      }`}
                    >
                      {showAssignModal.status}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => { setShowAssignModal(null); setConstraintWarning(null); setOverrideReason(''); setSuggestions([]); setStaffHours({}) }}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Urgency banner — shift starting within 2 hours */}
              {(() => {
                const shiftStart = new Date(`${showAssignModal.date}T${showAssignModal.startTime}:00`)
                const minsUntil = Math.round((shiftStart.getTime() - Date.now()) / 60000)
                if (minsUntil > 0 && minsUntil <= 120) {
                  return (
                    <div className="p-3 bg-red-600 text-white rounded-lg flex items-center gap-2">
                      <span className="text-lg">🚨</span>
                      <div>
                        <p className="font-bold text-sm">Shift starts in {minsUntil} minute{minsUntil !== 1 ? 's' : ''}</p>
                        <p className="text-xs opacity-90">Assign qualified staff below — suggestions are pre-loaded.</p>
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              {/* Current Assignments */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  Assigned Staff ({showAssignModal.assignments.length}/{showAssignModal.headcount})
                </h3>
                {showAssignModal.assignments.length === 0 ? (
                  <p className="text-sm text-gray-500">No staff assigned</p>
                ) : (
                  <div className="space-y-2">
                    {showAssignModal.assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium text-gray-900">{a.user.name}</span>
                        <button
                          onClick={() => handleUnassign(showAssignModal.id, a.user.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Constraint Warning */}
              {constraintWarning && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="font-semibold text-red-800 text-sm mb-2">Constraint Violations:</p>
                  <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                    {constraintWarning.violations?.map((v: string, i: number) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                  {constraintWarning.warnings?.length > 0 && (
                    <>
                      <p className="font-semibold text-yellow-800 text-sm mt-2 mb-1">Warnings:</p>
                      <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                        {constraintWarning.warnings?.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {constraintWarning.requiresOverride && (
                    <div className="mt-3 space-y-2">
                      {constraintWarning.requiresOverrideReason && (
                        <div>
                          <label className="block text-xs font-semibold text-red-800 mb-1">
                            Documented reason required (7th consecutive day):
                          </label>
                          <textarea
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Enter reason for override..."
                            rows={2}
                            className={`w-full text-xs border rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 ${
                              constraintWarning.reasonError && !overrideReason.trim()
                                ? 'border-red-500 bg-red-50'
                                : 'border-red-300 bg-white'
                            }`}
                          />
                          {constraintWarning.reasonError && !overrideReason.trim() && (
                            <p className="text-xs text-red-600 mt-0.5">A reason is required to proceed.</p>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => handleAssignOverride(constraintWarning.shiftId, constraintWarning.userId)}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                        disabled={constraintWarning.requiresOverrideReason && !overrideReason.trim()}
                      >
                        Override and Assign Anyway
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Suggestions — auto-loaded when modal opens */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  {loadingSuggestions ? 'Finding available staff…' : `Best matches (${suggestions.filter(s => s.score > 0).length} available)`}
                </h3>
                {loadingSuggestions ? (
                  <div className="animate-pulse space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No qualified staff found for this shift.</p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.slice(0, 6).map((s: any) => {
                      const hrs = staffHours[s.user.id] ?? 0
                      const hoursColor = hrs >= 40 ? 'text-red-600' : hrs >= 35 ? 'text-yellow-600' : 'text-gray-500'
                      return (
                        <div key={s.user.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{s.user.name}</p>
                            <p className={`text-xs ${hoursColor}`}>
                              {hrs}h this week
                              {hrs >= 40 ? ' — over limit' : hrs >= 35 ? ' — approaching limit' : ''}
                            </p>
                            {s.violations.length > 0 && (
                              <p className="text-xs text-yellow-600 mt-0.5">{s.violations[0]}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              s.score >= 80 ? 'bg-green-100 text-green-700' :
                              s.score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {s.score}%
                            </span>
                            <button
                              onClick={() => handleAssign(showAssignModal.id, s.user.id)}
                              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700"
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Assign from full qualified list */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">All Qualified Staff</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {users
                    .filter(
                      (u) =>
                        u.role !== 'admin' &&
                        !showAssignModal.assignments.find((a) => a.user.id === u.id) &&
                        u.skills?.some((s: any) => s.skill.id === showAssignModal.skill.id) &&
                        u.locationCertifications?.some(
                          (lc: any) => lc.location.id === showAssignModal.locationId
                        )
                    )
                    .map((u) => {
                      const hrs = staffHours[u.id] ?? 0
                      const hoursColor = hrs >= 40 ? 'text-red-600' : hrs >= 35 ? 'text-yellow-600' : 'text-gray-400'
                      return (
                        <div key={u.id} className="flex items-center justify-between p-2.5 hover:bg-gray-50 rounded-lg">
                          <div>
                            <span className="text-sm text-gray-900">{u.name}</span>
                            <span className={`ml-2 text-xs ${hoursColor}`}>{hrs}h</span>
                          </div>
                          <button
                            onClick={() => handleAssign(showAssignModal.id, u.id)}
                            className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-200"
                          >
                            Assign
                          </button>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Actions */}
              {showAssignModal.status === 'draft' && (
                <div className="flex gap-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => { handlePublish(showAssignModal.id); setShowAssignModal(null) }}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    Publish Shift
                  </button>
                  <button
                    onClick={() => { handleDelete(showAssignModal.id); setShowAssignModal(null) }}
                    className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-sm font-medium hover:bg-red-200"
                  >
                    Delete Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Shift Modal */}
      {showCreateModal && isManager && (
        <CreateShiftModal
          locations={locations}
          skills={skills}
          defaultDate={format(currentWeekStart, 'yyyy-MM-dd')}
          isAdmin={session?.user.role === 'admin'}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchShifts() }}
        />
      )}
    </div>
  )
}

function CreateShiftModal({
  locations,
  skills,
  defaultDate,
  isAdmin,
  onClose,
  onCreated,
}: {
  locations: Location[]
  skills: Skill[]
  defaultDate: string
  isAdmin: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    locationId: locations[0]?.id || '',
    skillId: skills[0]?.id || '',
    date: defaultDate,
    startTime: '09:00',
    endTime: '17:00',
    headcount: 1,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      onCreated()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create shift')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Create New Shift</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Skill Required</label>
              <select
                value={form.skillId}
                onChange={(e) => setForm({ ...form, skillId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                min={isAdmin ? undefined : new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Headcount</label>
              <input
                type="number"
                value={form.headcount}
                onChange={(e) => setForm({ ...form, headcount: parseInt(e.target.value) })}
                min={1}
                max={20}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

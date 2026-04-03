'use client'

import { useEffect, useState, useCallback } from 'react'

interface StaffMember {
  id: string
  name: string
  skill: string
  until: string
}

interface LocationStatus {
  location: { id: string; name: string; timezone: string }
  staffOnDuty: StaffMember[]
}

interface OnDutyData {
  asOf: string
  locations: LocationStatus[]
}

export default function OnDutyNow() {
  const [data, setData] = useState<OnDutyData | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchOnDuty = useCallback(async () => {
    try {
      const res = await fetch('/api/on-duty')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastUpdated(new Date())
      }
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  useEffect(() => {
    fetchOnDuty()
    const interval = setInterval(fetchOnDuty, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchOnDuty])

  // Also refresh on SSE shift events
  useEffect(() => {
    const evtSource = new EventSource('/api/sse')
    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (['shift_published', 'shift_assigned', 'shift_unassigned'].includes(event.type)) {
          fetchOnDuty()
        }
      } catch {
        // ignore
      }
    }
    return () => evtSource.close()
  }, [fetchOnDuty])

  const totalOnDuty = data?.locations.reduce((sum, l) => sum + l.staffOnDuty.length, 0) ?? 0
  const locationsWithStaff = data?.locations.filter((l) => l.staffOnDuty.length > 0).length ?? 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <h3 className="font-semibold text-gray-900">On Duty Now</h3>
          {totalOnDuty > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {totalOnDuty} staff · {locationsWithStaff} location{locationsWithStaff !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {!data ? (
          <div className="p-5 text-center text-sm text-gray-400">Loading...</div>
        ) : data.locations.length === 0 ? (
          <div className="p-5 text-center text-sm text-gray-400">No locations found</div>
        ) : (
          data.locations.map((loc) => (
            <div key={loc.location.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-900">{loc.location.name}</p>
                {loc.staffOnDuty.length === 0 ? (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">No active shifts</span>
                ) : (
                  <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    {loc.staffOnDuty.length} on duty
                  </span>
                )}
              </div>
              {loc.staffOnDuty.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {loc.staffOnDuty.map((staff, i) => (
                    <div
                      key={`${staff.id}-${i}`}
                      className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1"
                    >
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
                        {staff.name.charAt(0)}
                      </span>
                      <span className="text-xs font-medium text-gray-800">{staff.name}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500 capitalize">{staff.skill.replace('_', ' ')}</span>
                      <span className="text-xs text-gray-400">until {staff.until}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { format, addDays, startOfWeek } from 'date-fns'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Availability {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface SwapRequest {
  id: string
  type: string
  status: string
  createdAt: string
  shift: { date: string; startTime: string; endTime: string; location: { name: string }; skill: { name: string } }
  requester: { name: string }
  target: { name: string } | null
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([])
  const [myShifts, setMyShifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'availability' | 'swaps' | 'schedule'>('availability')

  useEffect(() => {
    if (session?.user.id) {
      fetchData()
    }
  }, [session?.user.id])

  async function fetchData() {
    setLoading(true)
    const [usersRes, swapsRes, shiftsRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/swap-requests'),
      fetch(`/api/shifts?userId=${session?.user.id}`),
    ])

    if (usersRes.ok) {
      const users = await usersRes.json()
      const me = users.find((u: any) => u.id === session?.user.id)
      if (me) {
        setUserProfile(me)
        setAvailabilities(
          me.availabilities || Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            startTime: '09:00',
            endTime: '17:00',
          }))
        )
      }
    }

    if (swapsRes.ok) setSwapRequests(await swapsRes.json())
    if (shiftsRes.ok) setMyShifts(await shiftsRes.json())
    setLoading(false)
  }

  const [editingAvail, setEditingAvail] = useState<Record<number, boolean>>({})

  function toggleAvailDay(day: number) {
    const existing = availabilities.find((a) => a.dayOfWeek === day)
    if (existing) {
      setAvailabilities((prev) => prev.filter((a) => a.dayOfWeek !== day))
    } else {
      setAvailabilities((prev) => [...prev, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }])
    }
  }

  function updateAvailTime(day: number, field: 'startTime' | 'endTime', value: string) {
    setAvailabilities((prev) =>
      prev.map((a) => (a.dayOfWeek === day ? { ...a, [field]: value } : a))
    )
  }

  async function saveAvailability() {
    setSaving(true)
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session?.user.id,
        availabilities: availabilities.map(({ dayOfWeek, startTime, endTime }) => ({
          dayOfWeek,
          startTime,
          endTime,
        })),
      }),
    })
    setSaving(false)
  }

  async function handleSwapAction(swapId: string, action: string) {
    await fetch('/api/swap-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: swapId, action }),
    })
    fetchData()
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Profile Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
            <span className="text-white text-2xl font-bold">
              {session?.user.name.charAt(0)}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{session?.user.name}</h1>
            <p className="text-gray-500">{session?.user.email}</p>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize mt-1 inline-block ${
              session?.user.role === 'admin' ? 'bg-red-100 text-red-700' :
              session?.user.role === 'manager' ? 'bg-purple-100 text-purple-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {session?.user.role}
            </span>
          </div>
        </div>

        {userProfile && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium">Skills</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {userProfile.skills?.map((s: any) => (
                  <span key={s.skill.id} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                    {s.skill.name.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Certified Locations</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {userProfile.locationCertifications?.map((lc: any) => (
                  <span key={lc.location.id} className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                    {lc.location.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'availability', label: 'My Availability' },
          { key: 'swaps', label: `Swap Requests (${swapRequests.length})` },
          { key: 'schedule', label: 'My Schedule' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Availability Tab */}
      {activeTab === 'availability' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Weekly Availability</h2>
            <button
              onClick={saveAvailability}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Availability'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Set your regular availability. Managers will use this when scheduling shifts.
          </p>

          <div className="space-y-3">
            {DAYS.map((day, i) => {
              const avail = availabilities.find((a) => a.dayOfWeek === i)
              return (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50">
                  <label className="flex items-center gap-3 min-w-28">
                    <input
                      type="checkbox"
                      checked={!!avail}
                      onChange={() => toggleAvailDay(i)}
                      className="rounded w-4 h-4 accent-blue-600"
                    />
                    <span className={`text-sm font-medium ${avail ? 'text-gray-900' : 'text-gray-400'}`}>
                      {day}
                    </span>
                  </label>
                  {avail ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={avail.startTime}
                        onChange={(e) => updateAvailTime(i, 'startTime', e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="time"
                        value={avail.endTime}
                        onChange={(e) => updateAvailTime(i, 'endTime', e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Not available</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Swaps Tab */}
      {activeTab === 'swaps' && (
        <div className="space-y-3">
          {swapRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-gray-500">No swap requests</p>
            </div>
          ) : (
            swapRequests.map((swap) => (
              <div key={swap.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        swap.type === 'swap' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {swap.type.toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        swap.status === 'approved' ? 'bg-green-100 text-green-700' :
                        swap.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        swap.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        swap.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {swap.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {swap.shift.location.name} - {swap.shift.skill.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {swap.shift.date} | {swap.shift.startTime} - {swap.shift.endTime}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Requested by {swap.requester.name}
                      {swap.target && ` → ${swap.target.name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">
                      {format(new Date(swap.createdAt), 'MMM d, yyyy')}
                    </p>
                    {swap.status === 'pending' && swap.target?.name === session?.user.name && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSwapAction(swap.id, 'accept')}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleSwapAction(swap.id, 'reject')}
                          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {swap.status === 'pending' && swap.requester.name === session?.user.name && (
                      <button
                        onClick={() => handleSwapAction(swap.id, 'cancel')}
                        className="mt-2 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    )}
                    {swap.status === 'accepted' && ['admin', 'manager'].includes(session?.user.role || '') && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSwapAction(swap.id, 'approve')}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleSwapAction(swap.id, 'deny')}
                          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="space-y-3">
          {myShifts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-gray-500">No shifts scheduled</p>
            </div>
          ) : (
            myShifts.map((shift: any) => (
              <div key={shift.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {shift.location.name} - {shift.skill.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {shift.date} | {shift.startTime} - {shift.endTime}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  shift.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {shift.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

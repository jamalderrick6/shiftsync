'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface Location {
  id: string
  name: string
  address: string
  timezone: string
  managers: Array<{ user: { id: string; name: string } }>
  certifications: Array<{ user: { id: string; name: string } }>
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export default function LocationsPage() {
  const { data: session } = useSession()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)

  const isAdmin = session?.user.role === 'admin'

  useEffect(() => {
    fetchLocations()
  }, [])

  async function fetchLocations() {
    setLoading(true)
    const res = await fetch('/api/locations')
    if (res.ok) setLocations(await res.json())
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-gray-500 text-sm">{locations.length} restaurant locations</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + Add Location
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((location) => (
            <div
              key={location.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedLocation(location)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl">
                    🏪
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{location.name}</h3>
                    <p className="text-sm text-gray-500">{location.address}</p>
                  </div>
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                  {location.timezone.split('/')[1]?.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium">Managers</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {location.managers.length}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium">Certified Staff</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {location.certifications.length}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Timezone</p>
                <p className="text-sm text-gray-700">{location.timezone}</p>
              </div>

              {location.managers.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 font-medium mb-1.5">Managers</p>
                  <div className="flex flex-wrap gap-1">
                    {location.managers.map((m) => (
                      <span key={m.user.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        {m.user.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Location Detail Modal */}
      {selectedLocation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{selectedLocation.name}</h2>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Address</p>
                  <p className="text-sm text-gray-900 mt-1">{selectedLocation.address}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Timezone</p>
                  <p className="text-sm text-gray-900 mt-1">{selectedLocation.timezone}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Managers</p>
                {selectedLocation.managers.length === 0 ? (
                  <p className="text-sm text-gray-500">No managers assigned</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedLocation.managers.map((m) => (
                      <span key={m.user.id} className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                        {m.user.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">
                  Certified Staff ({selectedLocation.certifications.length})
                </p>
                <div className="max-h-40 overflow-y-auto flex flex-wrap gap-2">
                  {selectedLocation.certifications.map((cert) => (
                    <span key={cert.user.id} className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
                      {cert.user.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Location Modal */}
      {showCreateModal && isAdmin && (
        <CreateLocationModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { fetchLocations(); setShowCreateModal(false) }}
        />
      )}
    </div>
  )
}

function CreateLocationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    timezone: 'America/New_York',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) onCreated()
    else {
      const data = await res.json()
      setError(data.error || 'Failed to create location')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Add Location</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Downtown Coastal"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main St, New York, NY"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

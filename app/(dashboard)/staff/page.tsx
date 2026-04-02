'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface User {
  id: string
  name: string
  email: string
  role: string
  desiredHours: number
  skills: Array<{ skill: { id: string; name: string } }>
  locationCertifications: Array<{ location: { id: string; name: string } }>
  availabilities: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
}

interface Location {
  id: string
  name: string
}

const SKILL_NAMES = ['bartender', 'line_cook', 'server', 'host', 'busser', 'dishwasher']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function StaffPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState('')

  const isAdmin = session?.user.role === 'admin'

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [usersRes, locsRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/locations'),
    ])
    if (usersRes.ok) setUsers(await usersRes.json())
    if (locsRes.ok) setLocations(await locsRes.json())
    setLoading(false)
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = !filterRole || u.role === filterRole
    return matchesSearch && matchesRole
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-500 text-sm">{users.length} team members</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + Add Staff
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search staff..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Skills</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Locations</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Desired Hrs/Wk</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        user.role === 'admin'
                          ? 'bg-red-100 text-red-700'
                          : user.role === 'manager'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.skills?.slice(0, 3).map((s: any) => (
                        <span
                          key={s.skill.id}
                          className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full"
                        >
                          {s.skill.name.replace('_', ' ')}
                        </span>
                      ))}
                      {user.skills?.length > 3 && (
                        <span className="text-xs text-gray-400">+{user.skills.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.locationCertifications?.slice(0, 2).map((lc: any) => (
                        <span
                          key={lc.location.id}
                          className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
                        >
                          {lc.location.name.split(' ')[0]}
                        </span>
                      ))}
                      {user.locationCertifications?.length > 2 && (
                        <span className="text-xs text-gray-400">
                          +{user.locationCertifications.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.desiredHours}h</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          locations={locations}
          isAdmin={isAdmin}
          onClose={() => setSelectedUser(null)}
          onUpdated={() => { fetchData(); setSelectedUser(null) }}
        />
      )}

      {/* Add Staff Modal */}
      {showAddModal && isAdmin && (
        <AddStaffModal
          locations={locations}
          onClose={() => setShowAddModal(false)}
          onCreated={() => { fetchData(); setShowAddModal(false) }}
        />
      )}
    </div>
  )
}

function UserDetailModal({
  user,
  locations,
  isAdmin,
  onClose,
  onUpdated,
}: {
  user: User
  locations: Location[]
  isAdmin: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: user.name,
    desiredHours: user.desiredHours,
    locationIds: user.locationCertifications?.map((lc: any) => lc.location.id) || [],
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, ...form }),
    })
    setLoading(false)
    onUpdated()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-700 font-bold text-lg">{user.name.charAt(0)}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{user.name}</h2>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium">Role</p>
              <span className={`text-sm font-medium capitalize px-2.5 py-1 rounded-full inline-block mt-1 ${
                user.role === 'admin' ? 'bg-red-100 text-red-700' :
                user.role === 'manager' ? 'bg-purple-100 text-purple-700' :
                'bg-blue-100 text-blue-700'
              }`}>{user.role}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Desired Hours/Week</p>
              {editing ? (
                <input
                  type="number"
                  value={form.desiredHours}
                  onChange={(e) => setForm({ ...form, desiredHours: parseInt(e.target.value) })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
              ) : (
                <p className="text-sm font-medium text-gray-900 mt-1">{user.desiredHours}h/week</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Skills</p>
            <div className="flex flex-wrap gap-2">
              {user.skills?.map((s: any) => (
                <span key={s.skill.id} className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                  {s.skill.name.replace('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Location Certifications</p>
            {editing && isAdmin ? (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <label key={loc.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.locationIds.includes(loc.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, locationIds: [...form.locationIds, loc.id] })
                        } else {
                          setForm({ ...form, locationIds: form.locationIds.filter((id) => id !== loc.id) })
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{loc.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.locationCertifications?.map((lc: any) => (
                  <span key={lc.location.id} className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
                    {lc.location.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Availability</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day, i) => {
                const avail = user.availabilities?.find((a) => a.dayOfWeek === i)
                return (
                  <div key={i} className="text-center">
                    <p className="text-xs text-gray-500 mb-1">{day}</p>
                    <div className={`h-8 rounded text-xs flex items-center justify-center ${
                      avail ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {avail ? '✓' : '-'}
                    </div>
                    {avail && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {avail.startTime}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 border border-blue-600 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-50"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddStaffModal({
  locations,
  onClose,
  onCreated,
}: {
  locations: Location[]
  onClose: () => void
  onCreated: () => void
}) {
  const ALL_SKILLS = ['bartender', 'line_cook', 'server', 'host', 'busser', 'dishwasher']
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff',
    desiredHours: 40,
    skills: [] as string[],
    locationIds: [] as string[],
  })
  const [allSkills, setAllSkills] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((users) => {
        const skillMap = new Map<string, { id: string; name: string }>()
        users.forEach((u: any) =>
          u.skills?.forEach(({ skill }: any) => skillMap.set(skill.id, skill))
        )
        setAllSkills(Array.from(skillMap.values()))
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      onCreated()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create staff member')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Add Staff Member</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desired Hrs/Week</label>
              <input
                type="number"
                value={form.desiredHours}
                onChange={(e) => setForm({ ...form, desiredHours: parseInt(e.target.value) })}
                min={0}
                max={60}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
            <div className="grid grid-cols-3 gap-2">
              {allSkills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.skills.includes(skill.id)}
                    onChange={(e) => {
                      if (e.target.checked) setForm({ ...form, skills: [...form.skills, skill.id] })
                      else setForm({ ...form, skills: form.skills.filter((s) => s !== skill.id) })
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{skill.name.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location Certifications</label>
            <div className="space-y-2">
              {locations.map((loc) => (
                <label key={loc.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.locationIds.includes(loc.id)}
                    onChange={(e) => {
                      if (e.target.checked) setForm({ ...form, locationIds: [...form.locationIds, loc.id] })
                      else setForm({ ...form, locationIds: form.locationIds.filter((id) => id !== loc.id) })
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{loc.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  before: string | null
  after: string | null
  metadata: string | null
  createdAt: string
  user: { id: string; name: string; email: string; role: string } | null
}

interface Location {
  id: string
  name: string
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  assign: 'bg-purple-100 text-purple-700',
  unassign: 'bg-orange-100 text-orange-700',
  publish: 'bg-teal-100 text-teal-700',
  approve: 'bg-green-100 text-green-700',
  claim: 'bg-blue-100 text-blue-700',
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    startDate: format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    locationId: '',
    entityType: '',
    page: 1,
  })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
    if (filters.locationId) params.set('locationId', filters.locationId)
    if (filters.entityType) params.set('entityType', filters.entityType)
    params.set('page', String(filters.page))

    const res = await fetch(`/api/audit-logs?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    }
    setLoading(false)
  }, [filters])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetch('/api/locations').then((r) => r.json()).then(setLocations)
  }, [])

  function exportCSV() {
    const headers = ['Time', 'User', 'Action', 'Entity Type', 'Entity ID', 'Before', 'After']
    const rows = logs.map((l) => [
      format(new Date(l.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      l.user?.name ?? 'System',
      l.action,
      l.entityType,
      l.entityId,
      l.before ? JSON.stringify(JSON.parse(l.before)) : '',
      l.after ? JSON.stringify(JSON.parse(l.after)) : '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${filters.startDate}-to-${filters.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function tryParse(str: string | null) {
    if (!str) return null
    try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500 text-sm">Complete history of all schedule changes</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={logs.length === 0}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
          <select
            value={filters.locationId}
            onChange={(e) => setFilters({ ...filters, locationId: e.target.value, page: 1 })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Entity Type</label>
          <select
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
          >
            <option value="">All types</option>
            <option value="shift">Shift</option>
            <option value="shiftAssignment">Assignment</option>
            <option value="swapRequest">Swap Request</option>
            <option value="dropRequest">Drop Request</option>
            <option value="user">User</option>
            <option value="location">Location</option>
          </select>
        </div>
        <div className="text-sm text-gray-500 self-end pb-1.5">
          {total} records
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No audit records found for the selected filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-40">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <div>
                          <p className="font-medium text-gray-900 text-xs">{log.user.name}</p>
                          <p className="text-gray-400 text-xs capitalize">{log.user.role}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-700 capitalize">{log.entityType.replace(/([A-Z])/g, ' $1')}</p>
                      <p className="text-xs text-gray-400 font-mono">{log.entityId.slice(0, 12)}…</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {log.metadata && (() => {
                        try {
                          const m = JSON.parse(log.metadata)
                          if (m.overrideReason) return <span className="text-orange-600 font-medium">Override: {m.overrideReason}</span>
                        } catch { return null }
                      })()}
                      <span className="text-gray-300">{(log.before || log.after) ? 'click to expand' : ''}</span>
                    </td>
                  </tr>
                  {expanded === log.id && (log.before || log.after) && (
                    <tr key={`${log.id}-expanded`} className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4">
                          {log.before && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1">Before</p>
                              <pre className="text-xs bg-red-50 border border-red-100 rounded p-2 overflow-auto max-h-40 text-gray-700">
                                {tryParse(log.before)}
                              </pre>
                            </div>
                          )}
                          {log.after && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 mb-1">After</p>
                              <pre className="text-xs bg-green-50 border border-green-100 rounded p-2 overflow-auto max-h-40 text-gray-700">
                                {tryParse(log.after)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {filters.page} of {totalPages} ({total} total records)
          </p>
          <div className="flex gap-2">
            <button
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={filters.page >= totalPages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

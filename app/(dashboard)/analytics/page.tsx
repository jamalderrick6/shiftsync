'use client'

import { useState, useEffect } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'

interface FairnessStats {
  user: { id: string; name: string; email: string; desiredHours: number }
  totalHours: number
  shiftCount: number
  skills: string[]
  locations: string[]
  hoursVsDesired: number
  fulfillmentRate: number | null
}

interface OvertimeAlert {
  user: { id: string; name: string; email: string }
  weekStart: string
  hours: number
  shiftCount: number
  severity: 'warning' | 'overtime'
}

export default function AnalyticsPage() {
  const [fairnessStats, setFairnessStats] = useState<FairnessStats[]>([])
  const [overtimeAlerts, setOvertimeAlerts] = useState<OvertimeAlert[]>([])
  const [fairnessSummary, setFairnessSummary] = useState<any>(null)
  const [overtimeSummary, setOvertimeSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'fairness' | 'overtime'>('fairness')
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    endDate: format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 27), 'yyyy-MM-dd'),
  })

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange])

  async function fetchAnalytics() {
    setLoading(true)
    const params = new URLSearchParams(dateRange)
    const [fairnessRes, overtimeRes] = await Promise.all([
      fetch(`/api/analytics/fairness?${params}`),
      fetch(`/api/analytics/overtime?${params}`),
    ])

    if (fairnessRes.ok) {
      const data = await fairnessRes.json()
      setFairnessStats(data.stats)
      setFairnessSummary(data.summary)
    }
    if (overtimeRes.ok) {
      const data = await overtimeRes.json()
      setOvertimeAlerts(data.alerts)
      setOvertimeSummary(data.summary)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm">Scheduling fairness and overtime tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">From:</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">To:</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {fairnessSummary && overtimeSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Avg Hours/Staff</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fairnessSummary.avgHours}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Std Deviation</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fairnessSummary.stdDev}h</p>
            <p className="text-xs text-gray-500 mt-0.5">Lower is fairer</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Staff Scheduled</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fairnessSummary.totalStaff}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Overtime Weeks</p>
            <p className={`text-2xl font-bold mt-1 ${overtimeSummary.totalOvertimeWeeks > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {overtimeSummary.totalOvertimeWeeks}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">Warning Weeks</p>
            <p className={`text-2xl font-bold mt-1 ${overtimeSummary.totalWarningWeeks > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
              {overtimeSummary.totalWarningWeeks}
            </p>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('fairness')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'fairness'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Hours Fairness
        </button>
        <button
          onClick={() => setActiveTab('overtime')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'overtime'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Overtime Alerts
          {overtimeSummary && (overtimeSummary.totalOvertimeWeeks + overtimeSummary.totalWarningWeeks) > 0 && (
            <span className="ml-2 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">
              {overtimeSummary.totalOvertimeWeeks + overtimeSummary.totalWarningWeeks}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading analytics...</div>
      ) : activeTab === 'fairness' ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Staff Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Total Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Shifts</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">vs Desired</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Fulfillment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Hours Bar</th>
              </tr>
            </thead>
            <tbody>
              {fairnessStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No data for the selected period
                  </td>
                </tr>
              ) : (
                fairnessStats.map((stat) => (
                  <tr key={stat.user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{stat.user.name}</p>
                      <p className="text-xs text-gray-500">{stat.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${
                        stat.totalHours >= 40 ? 'text-red-600' :
                        stat.totalHours >= 35 ? 'text-yellow-600' :
                        'text-gray-900'
                      }`}>
                        {stat.totalHours}h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{stat.shiftCount}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${
                        stat.hoursVsDesired > 5 ? 'text-red-600' :
                        stat.hoursVsDesired > 0 ? 'text-yellow-600' :
                        stat.hoursVsDesired < -10 ? 'text-blue-600' :
                        'text-gray-700'
                      }`}>
                        {stat.hoursVsDesired > 0 ? '+' : ''}{stat.hoursVsDesired}h
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {stat.fulfillmentRate !== null ? (
                        <span className={`text-sm font-medium ${
                          stat.fulfillmentRate > 110 ? 'text-red-600' :
                          stat.fulfillmentRate > 100 ? 'text-yellow-600' :
                          stat.fulfillmentRate >= 90 ? 'text-green-600' :
                          'text-gray-700'
                        }`}>
                          {stat.fulfillmentRate}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 w-32">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            stat.totalHours >= 40 ? 'bg-red-500' :
                            stat.totalHours >= 35 ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`}
                          style={{
                            width: `${Math.min(100, (stat.totalHours / Math.max(40, fairnessSummary?.maxHours || 40)) * 100)}%`
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {overtimeAlerts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
              <p className="text-green-600 text-lg font-semibold">No overtime issues detected</p>
              <p className="text-gray-500 text-sm mt-1">All staff hours are within acceptable ranges.</p>
            </div>
          ) : (
            overtimeAlerts.map((alert, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between ${
                  alert.severity === 'overtime'
                    ? 'border-red-200'
                    : 'border-yellow-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                    alert.severity === 'overtime' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    {alert.severity === 'overtime' ? '🚨' : '⚠️'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{alert.user.name}</p>
                    <p className="text-sm text-gray-500">
                      Week of {format(new Date(alert.weekStart + 'T00:00:00'), 'MMM d, yyyy')} •{' '}
                      {alert.shiftCount} shifts
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${
                    alert.severity === 'overtime' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {alert.hours}h
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    alert.severity === 'overtime'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {alert.severity === 'overtime' ? 'OVERTIME' : 'WARNING'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

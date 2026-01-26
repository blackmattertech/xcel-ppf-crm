'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useFollowUpNotifications } from '@/hooks/useFollowUpNotifications'
import Layout from '@/components/Layout'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from 'recharts'
import { TrendingUp, TrendingDown, Users, Target, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, BarChart3, Table, LineChart as LineChartIcon } from 'lucide-react'

// Modern gradient color palette
const MODERN_COLORS = {
  gradients: {
    primary: ['linear-gradient(135deg, #667eea 0%, #764ba2 100%)', '#667eea'],
    success: ['linear-gradient(135deg, #10b981 0%, #059669 100%)', '#10b981'],
    warning: ['linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', '#f59e0b'],
    danger: ['linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', '#ef4444'],
    info: ['linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', '#3b82f6'],
    purple: ['linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', '#8b5cf6'],
    pink: ['linear-gradient(135deg, #ec4899 0%, #db2777 100%)', '#ec4899'],
    cyan: ['linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', '#06b6d4'],
  },
  chart: {
    primary: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0'],
    status: {
      new: '#667eea',
      qualified: '#10b981',
      quotation_shared: '#f59e0b',
      quotation_viewed: '#8b5cf6',
      quotation_accepted: '#10b981',
      converted: '#10b981',
      discarded: '#ef4444',
      interested: '#ec4899',
      negotiation: '#f59e0b',
      unqualified: '#6b7280',
    },
  },
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{entry.value}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

// Modern KPI Card Component
const KPICard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  gradient, 
  progress 
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  trend?: { value: number; isPositive: boolean }
  gradient: string
  progress?: number
}) => {
  const gradientClass = gradient === 'primary' ? 'from-indigo-500 to-purple-600' :
    gradient === 'success' ? 'from-green-500 to-emerald-600' :
    gradient === 'warning' ? 'from-amber-500 to-orange-600' :
    gradient === 'danger' ? 'from-red-500 to-rose-600' :
    'from-blue-500 to-cyan-600'

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 group">
      <div className={`bg-gradient-to-br ${gradientClass} p-6 text-white`}>
        <div className="flex items-center justify-between">
          <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
            <Icon className="w-6 h-6" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-sm font-medium ${trend.isPositive ? 'text-green-100' : 'text-red-100'}`}>
              {trend.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="mt-4">
          <p className="text-white/80 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-white/70 text-xs mt-1">{subtitle}</p>}
        </div>
      </div>
      {progress !== undefined && (
        <div className="px-6 py-4 bg-gray-50">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 bg-gradient-to-r ${gradientClass}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics()
  const [analyticsViewMode, setAnalyticsViewMode] = useState<'chart' | 'table' | 'graph'>('chart')
  
  const userRole = user?.role || null
  const isTeleCaller = userRole === 'tele_caller'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  
  // Only fetch follow-up notifications if needed
  const { data: followUpData } = useFollowUpNotifications(isTeleCaller || isAdmin)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Don't show anything if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null
  }

  const followUpAlerts = followUpData ? {
    overdue: followUpData.overdue?.length || 0,
    upcoming: followUpData.upcoming?.length || 0,
    adminNotifications: followUpData.adminNotifications?.length || 0,
  } : null

  // Prepare chart data
  const leadsBySourceData = useMemo(() => {
    if (!analytics?.leadsBySource) return []
    return Object.entries(analytics.leadsBySource).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: value as number,
    }))
  }, [analytics])

  const leadsByStatusData = useMemo(() => {
    if (!analytics?.leadsByStatus) return []
    return Object.entries(analytics.leadsByStatus).map(([name, value]) => ({
      name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: value as number,
      color: MODERN_COLORS.chart.status[name as keyof typeof MODERN_COLORS.chart.status] || MODERN_COLORS.chart.primary[0],
    }))
  }, [analytics])

  const repPerformanceData = useMemo(() => {
    if (!analytics?.repPerformance || analytics.repPerformance.length === 0) return []
    return analytics.repPerformance.map((rep) => ({
      name: rep.user_name,
      'Total Leads': rep.total_leads,
      'Converted': rep.converted_leads,
      'Conversion Rate': parseFloat(rep.conversion_rate.toFixed(1)),
    }))
  }, [analytics])

  // Calculate total leads properly
  const totalLeads = useMemo(() => {
    if (!analytics?.leadsByStatus) return 0
    return Object.values(analytics.leadsByStatus).reduce((sum, count) => sum + (count || 0), 0)
  }, [analytics])

  // Radial chart data for conversion rate
  const conversionRadialData = useMemo(() => {
    if (!analytics) return []
    const rate = Math.min(analytics.conversionRate, 100)
    return [
      {
        name: 'Conversion Rate',
        value: rate,
        fill: '#10b981',
      },
    ]
  }, [analytics])

  return (
    <Layout>
      <div className="p-6 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Overview of your Leads and Follow-ups</p>
          </div>

          {/* Follow-up Alerts */}
          {isTeleCaller && followUpAlerts && (followUpAlerts.overdue > 0 || followUpAlerts.upcoming > 0) && (
            <div className="mb-6 space-y-3">
              {followUpAlerts.overdue > 0 && (
                <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 p-4 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-red-900">
                        {followUpAlerts.overdue} Overdue Follow-up{followUpAlerts.overdue > 1 ? 's' : ''}
                      </h3>
                      <p className="text-sm text-red-700">Please complete your overdue follow-ups as soon as possible.</p>
                    </div>
                  </div>
                </div>
              )}
              {followUpAlerts.upcoming > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-l-4 border-amber-500 p-4 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900">
                        {followUpAlerts.upcoming} Upcoming Follow-up{followUpAlerts.upcoming > 1 ? 's' : ''} in Next 24 Hours
                      </h3>
                      <p className="text-sm text-amber-700">Make sure you're prepared for these scheduled calls.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Follow-up Alerts */}
          {isAdmin && followUpAlerts && followUpAlerts.adminNotifications && followUpAlerts.adminNotifications > 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-4 rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-orange-900">
                        {followUpAlerts.adminNotifications} Follow-up{followUpAlerts.adminNotifications > 1 ? 's' : ''} Pending for 1+ Day
                      </h3>
                      <p className="text-sm text-orange-700">There are follow-ups that have been pending for more than 1 day and need attention.</p>
                    </div>
                  </div>
                  <Link
                    href="/followups"
                    className="text-sm font-medium text-orange-800 hover:text-orange-900 underline flex items-center gap-1"
                  >
                    View All <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Modern KPI Cards */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <KPICard
                title="Total Leads"
                value={totalLeads > 0 ? totalLeads : (analytics ? 0 : '—')}
                icon={Users}
                gradient="primary"
              />
              <KPICard
                title="Conversion Rate"
                value={analytics ? `${analytics.conversionRate.toFixed(1)}%` : '—'}
                subtitle={isTeleCaller ? 'Your performance' : isAdmin ? 'Overall system' : 'System average'}
                icon={Target}
                gradient="success"
                progress={analytics ? analytics.conversionRate : 0}
              />
              <KPICard
                title="Follow-up Compliance"
                value={analytics ? `${analytics.followUpCompliance.toFixed(1)}%` : '—'}
                icon={CheckCircle2}
                gradient="info"
                progress={analytics ? analytics.followUpCompliance : 0}
              />
              <KPICard
                title="SLA Breaches"
                value={analytics ? analytics.slaBreaches : '—'}
                icon={AlertTriangle}
                gradient="danger"
              />
            </div>
          )}

          {/* Analytics View Toggle */}
          {!analyticsLoading && analytics && (
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                <button
                  onClick={() => setAnalyticsViewMode('chart')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 ${
                    analyticsViewMode === 'chart'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm font-medium">Chart</span>
                </button>
                <button
                  onClick={() => setAnalyticsViewMode('table')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 ${
                    analyticsViewMode === 'table'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  <span className="text-sm font-medium">Table</span>
                </button>
                <button
                  onClick={() => setAnalyticsViewMode('graph')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 ${
                    analyticsViewMode === 'graph'
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <LineChartIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">Graph</span>
                </button>
              </div>
            </div>
          )}

          {/* Analytics Section */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : analyticsViewMode === 'chart' ? (
            <>
              {/* Leads by Source and Status - Modern Donut Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Leads by Source - Donut Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Source</h2>
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                  </div>
                  {leadsBySourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={leadsBySourceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {leadsBySourceData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={MODERN_COLORS.chart.primary[index % MODERN_COLORS.chart.primary.length]}
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          height={60}
                          formatter={(value, entry: any) => (
                            <span className="text-sm text-gray-700">
                              {entry.payload.name}: <span className="font-semibold">{entry.payload.value}</span>
                            </span>
                          )}
                          iconType="circle"
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Leads by Status - Donut Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Status</h2>
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                  {leadsByStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={leadsByStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {leadsByStatusData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          height={60}
                          formatter={(value, entry: any) => (
                            <span className="text-sm text-gray-700">
                              {entry.payload.name}: <span className="font-semibold">{entry.payload.value}</span>
                            </span>
                          )}
                          iconType="circle"
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <Target className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rep Performance - Modern Bar Chart */}
              {repPerformanceData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Rep Performance</h2>
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={repPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorTotalLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#667eea" stopOpacity={0.9}/>
                          <stop offset="95%" stopColor="#764ba2" stopOpacity={0.9}/>
                        </linearGradient>
                        <linearGradient id="colorConverted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.9}/>
                          <stop offset="95%" stopColor="#059669" stopOpacity={0.9}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                      />
                      <Bar 
                        dataKey="Total Leads" 
                        fill="url(#colorTotalLeads)" 
                        radius={[8, 8, 0, 0]}
                        name="Total Leads"
                      />
                      <Bar 
                        dataKey="Converted" 
                        fill="url(#colorConverted)" 
                        radius={[8, 8, 0, 0]}
                        name="Converted"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  
                  {/* Modern Rep Performance Table */}
                  <div className="mt-8 overflow-hidden rounded-lg border border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Rep
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Total Leads
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Converted
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Conversion Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analytics?.repPerformance.map((rep, index) => (
                            <tr 
                              key={rep.user_id} 
                              className="hover:bg-gray-50 transition-colors duration-150"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                                    {rep.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-semibold text-gray-900">{rep.user_name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{rep.total_leads}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-green-600">{rep.converted_leads}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {rep.conversion_rate.toFixed(1)}%
                                  </div>
                                  <div className="w-24 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all duration-500"
                                      style={{ width: `${Math.min(rep.conversion_rate, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : analyticsViewMode === 'table' ? (
            <>
              {/* Table View */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Leads by Source Table */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Source</h2>
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                  </div>
                  {leadsBySourceData.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Source
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Count
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Percentage
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {leadsBySourceData.map((entry, index) => {
                            const total = leadsBySourceData.reduce((sum, e) => sum + e.value, 0)
                            const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0'
                            return (
                              <tr key={entry.name} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div 
                                      className="w-3 h-3 rounded-full mr-3"
                                      style={{ backgroundColor: MODERN_COLORS.chart.primary[index % MODERN_COLORS.chart.primary.length] }}
                                    ></div>
                                    <span className="text-sm font-medium text-gray-900">{entry.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">{percentage}%</span>
                                    <div className="w-24 bg-gray-200 rounded-full h-2">
                                      <div
                                        className="h-2 rounded-full transition-all duration-500"
                                        style={{ 
                                          width: `${percentage}%`,
                                          backgroundColor: MODERN_COLORS.chart.primary[index % MODERN_COLORS.chart.primary.length]
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Leads by Status Table */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Status</h2>
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                  {leadsByStatusData.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-purple-50 to-pink-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Count
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Percentage
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {leadsByStatusData.map((entry, index) => {
                            const total = leadsByStatusData.reduce((sum, e) => sum + e.value, 0)
                            const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0'
                            return (
                              <tr key={entry.name} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div 
                                      className="w-3 h-3 rounded-full mr-3"
                                      style={{ backgroundColor: entry.color }}
                                    ></div>
                                    <span className="text-sm font-medium text-gray-900">{entry.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-sm font-semibold text-gray-900">{entry.value}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">{percentage}%</span>
                                    <div className="w-24 bg-gray-200 rounded-full h-2">
                                      <div
                                        className="h-2 rounded-full transition-all duration-500"
                                        style={{ 
                                          width: `${percentage}%`,
                                          backgroundColor: entry.color
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <Target className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rep Performance Table */}
              {repPerformanceData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Rep Performance</h2>
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Rep
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Total Leads
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Converted
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Conversion Rate
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analytics?.repPerformance.map((rep, index) => (
                            <tr 
                              key={rep.user_id} 
                              className="hover:bg-gray-50 transition-colors duration-150"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                                    {rep.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-semibold text-gray-900">{rep.user_name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{rep.total_leads}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-green-600">{rep.converted_leads}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {rep.conversion_rate.toFixed(1)}%
                                  </div>
                                  <div className="w-24 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all duration-500"
                                      style={{ width: `${Math.min(rep.conversion_rate, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Graph View - Line and Area Charts (Default) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Leads by Source - Area Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Source Trend</h2>
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <LineChartIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                  </div>
                  {leadsBySourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={leadsBySourceData}>
                        <defs>
                          <linearGradient id="colorSource" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#667eea" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#764ba2" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#6b7280"
                          fontSize={12}
                          tickLine={false}
                        />
                        <YAxis 
                          stroke="#6b7280"
                          fontSize={12}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#667eea" 
                          strokeWidth={2}
                          fill="url(#colorSource)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <LineChartIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Leads by Status - Line Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Leads by Status Trend</h2>
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                  {leadsByStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={leadsByStatusData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#6b7280"
                          fontSize={10}
                          tickLine={false}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis 
                          stroke="#6b7280"
                          fontSize={12}
                          tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#8b5cf6" 
                          strokeWidth={3}
                          dot={{ fill: '#8b5cf6', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p>No data available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rep Performance - Multi-line Chart */}
              {repPerformanceData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Rep Performance Trend</h2>
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={repPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        fontSize={12}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Total Leads" 
                        stroke="#667eea" 
                        strokeWidth={3}
                        dot={{ fill: '#667eea', r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Total Leads"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Converted" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        dot={{ fill: '#10b981', r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Converted"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

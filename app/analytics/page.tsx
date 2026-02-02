'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { BarChart3, TrendingUp, Users, DollarSign, Clock, Target } from 'lucide-react'

interface PipelineMetrics {
  stage: string
  leadCount: number
  averageTimeInStage: number
  conversionRate: number
  dropOffRate: number
}

interface SourceROI {
  source: string
  totalLeads: number
  convertedLeads: number
  conversionRate: number
  totalRevenue: number
  averageDealValue: number
  roi: number
}

interface CohortAnalysis {
  cohort: string
  totalLeads: number
  convertedLeads: number
  conversionRate: number
  averageTimeToConvert: number
  totalRevenue: number
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const [pipeline, setPipeline] = useState<PipelineMetrics[]>([])
  const [sourceROI, setSourceROI] = useState<SourceROI[]>([])
  const [cohort, setCohort] = useState<CohortAnalysis[]>([])
  const [repPerformance, setRepPerformance] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'pipeline' | 'source' | 'cohort' | 'reps' | 'funnel'>('pipeline')
  const [loading, setLoading] = useState(true)

  const userRole = user?.role || null
  const userPermissions = user?.permissions || []
  const isAllowedRole = userRole === 'super_admin' || userRole === 'admin' || userRole === 'marketing'
  const hasReadPermission = userPermissions.includes('analytics.read')
  const hasManagePermission = userPermissions.includes('analytics.manage')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check permissions
    if (!authLoading && user) {
      if (!isAllowedRole && !hasReadPermission && !hasManagePermission) {
        router.push('/dashboard')
      }
    }
  }, [authLoading, isAuthenticated, user, userRole, userPermissions, isAllowedRole, hasReadPermission, hasManagePermission, router])

  useEffect(() => {
    if (isAllowedRole || hasReadPermission || hasManagePermission) {
      fetchAnalytics()
    }
  }, [activeTab, isAllowedRole, hasReadPermission, hasManagePermission])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  if (!authLoading && user && !isAllowedRole && !hasReadPermission && !hasManagePermission) {
    return null
  }

  async function fetchAnalytics() {
    setLoading(true)
    try {
      // Map frontend tab IDs to backend metric names
      const metricMap: Record<string, string> = {
        'pipeline': 'pipeline',
        'source': 'source_roi',
        'cohort': 'cohort',
        'reps': 'rep_performance',
        'funnel': 'funnel',
      }
      
      const metric = metricMap[activeTab] || activeTab
      const response = await fetch(`/api/analytics/advanced?metric=${metric}`)
      
      if (response.ok) {
        const data = await response.json()
        switch (activeTab) {
          case 'pipeline':
            setPipeline(Array.isArray(data.data) ? data.data : [])
            break
          case 'source':
            setSourceROI(Array.isArray(data.data) ? data.data : [])
            break
          case 'cohort':
            setCohort(Array.isArray(data.data) ? data.data : [])
            break
          case 'reps':
            setRepPerformance(Array.isArray(data.data) ? data.data : [])
            break
          case 'funnel':
            setFunnel(Array.isArray(data.data) ? data.data : [])
            break
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to fetch analytics:', errorData.error || 'Unknown error')
        // Set empty arrays on error
        setPipeline([])
        setSourceROI([])
        setCohort([])
        setRepPerformance([])
        setFunnel([])
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
      // Set empty arrays on error
      setPipeline([])
      setSourceROI([])
      setCohort([])
      setRepPerformance([])
      setFunnel([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Advanced Analytics</h1>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200 overflow-x-auto">
          {[
            { id: 'pipeline', label: 'Pipeline', icon: BarChart3 },
            { id: 'source', label: 'Source ROI', icon: DollarSign },
            { id: 'cohort', label: 'Cohort Analysis', icon: TrendingUp },
            { id: 'reps', label: 'Rep Performance', icon: Users },
            { id: 'funnel', label: 'Conversion Funnel', icon: Target },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-[#ed1b24] border-b-2 border-[#ed1b24]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Pipeline Metrics */}
        {activeTab === 'pipeline' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : pipeline.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No pipeline metrics available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Stage</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Leads</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Avg Time (hrs)</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Conversion %</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Drop-off %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.map((metric) => (
                      <tr key={metric.stage} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium capitalize">{metric.stage.replace(/_/g, ' ')}</td>
                        <td className="py-3 px-4 text-right">{metric.leadCount}</td>
                        <td className="py-3 px-4 text-right">{metric.averageTimeInStage.toFixed(1)}</td>
                        <td className="py-3 px-4 text-right text-green-600">{metric.conversionRate.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right text-red-600">{metric.dropOffRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Source ROI */}
        {activeTab === 'source' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : sourceROI.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No source ROI data available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Source</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Total Leads</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Converted</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Conversion %</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Revenue</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">ROI %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceROI.map((source) => (
                      <tr key={source.source} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium capitalize">{source.source || 'Unknown'}</td>
                        <td className="py-3 px-4 text-right">{source.totalLeads}</td>
                        <td className="py-3 px-4 text-right">{source.convertedLeads}</td>
                        <td className="py-3 px-4 text-right text-green-600">{source.conversionRate.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right">${source.totalRevenue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold">{source.roi.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Cohort Analysis */}
        {activeTab === 'cohort' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : cohort.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No cohort analysis data available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Cohort</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Total Leads</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Converted</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Conversion %</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Avg Days to Convert</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohort.map((c) => (
                      <tr key={c.cohort} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{c.cohort}</td>
                        <td className="py-3 px-4 text-right">{c.totalLeads}</td>
                        <td className="py-3 px-4 text-right">{c.convertedLeads}</td>
                        <td className="py-3 px-4 text-right text-green-600">{c.conversionRate.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right">{c.averageTimeToConvert.toFixed(1)}</td>
                        <td className="py-3 px-4 text-right">${c.totalRevenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Rep Performance */}
        {activeTab === 'reps' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : repPerformance.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No rep performance data available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Rep</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Total Leads</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Converted</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Conversion %</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Avg Response (min)</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repPerformance.map((rep) => (
                      <tr key={rep.userId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{rep.userName || 'Unknown'}</td>
                        <td className="py-3 px-4 text-right">{rep.totalLeads || 0}</td>
                        <td className="py-3 px-4 text-right">{rep.convertedLeads || 0}</td>
                        <td className="py-3 px-4 text-right text-green-600">{(rep.conversionRate || 0).toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right">{(rep.averageResponseTime || 0).toFixed(1)}</td>
                        <td className="py-3 px-4 text-right">${(rep.totalRevenue || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Conversion Funnel */}
        {activeTab === 'funnel' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : funnel.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No conversion funnel data available</div>
            ) : (
              <div className="space-y-4">
                {funnel.map((stage, idx) => {
                  const maxCount = funnel[0]?.count || 1
                  const width = maxCount > 0 ? (stage.count / maxCount) * 100 : 0
                  return (
                    <div key={stage.stage || idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 capitalize">{(stage.stage || 'Unknown').replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">{stage.count || 0} leads</span>
                          <span className="text-sm font-semibold text-gray-900">{(stage.percentage || 0).toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="h-4 rounded-full bg-[#ed1b24] transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

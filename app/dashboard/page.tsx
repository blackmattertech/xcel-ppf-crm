'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Users, TrendingUp, CheckCircle, AlertTriangle } from 'lucide-react'
import Layout from '@/components/Layout'
import { useAuthContext } from '@/components/AuthProvider'
import KPICard from '@/components/dashboard/KPICard'
import DashboardCard from '@/components/dashboard/DashboardCard'
import ViewSwitcher, { viewOptions, type ViewMode } from '@/components/dashboard/ViewSwitcher'
import LeadsBySourcePie from '@/components/dashboard/LeadsBySourcePie'
import LeadsByStatusPie from '@/components/dashboard/LeadsByStatusPie'
import LeadsBySourceTable from '@/components/dashboard/LeadsBySourceTable'
import LeadsByStatusTable from '@/components/dashboard/LeadsByStatusTable'
import LeadsOverTimeLine from '@/components/dashboard/LeadsOverTimeLine'
import LeadsOverTimeTable from '@/components/dashboard/LeadsOverTimeTable'
import RepPerformanceBar from '@/components/dashboard/RepPerformanceBar'
import RepPerformanceTable from '@/components/dashboard/RepPerformanceTable'
import Leaderboard from '@/components/dashboard/Leaderboard'
import LeaderboardBar from '@/components/dashboard/LeaderboardBar'
import LeaderboardPie from '@/components/dashboard/LeaderboardPie'
import LeadsInterestedByProductBar from '@/components/dashboard/LeadsInterestedByProductBar'
import LeadsInterestedByProductPie from '@/components/dashboard/LeadsInterestedByProductPie'
import LeadsInterestedByProductTable from '@/components/dashboard/LeadsInterestedByProductTable'
import LeadsOverTimePie from '@/components/dashboard/LeadsOverTimePie'
import ProductsHeatMap from '@/components/dashboard/ProductsHeatMap'
import RepPerformancePie from '@/components/dashboard/RepPerformancePie'

interface Analytics {
  leadsBySource: Record<string, number>
  leadsByStatus: Record<string, number>
  conversionRate: number
  repPerformance: Array<{
    user_id: string
    user_name: string
    total_leads: number
    converted_leads: number
    conversion_rate: number
  }>
  followUpCompliance: number
  slaBreaches: number
  leadsOverTime?: Array<{ date: string; leads: number; converted: number }>
  leadsInterestedByProduct?: Array<{ product_name: string; product_id: string; leads_count: number }>
  convertedLeadsByProduct?: Array<{ product_name: string; product_id: string; leads_count: number }>
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, role } = useAuthContext()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [productsWithStats, setProductsWithStats] = useState<Array<{ id: string; title: string; leads_interested: number; customers_bought: number }>>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [followUpAlerts, setFollowUpAlerts] = useState<{
    overdue: number
    upcoming: number
    adminNotifications?: number
  } | null>(null)

  // View mode per section: line | table for time, chart | table for source/status, bar | table for rep
  const [viewTime, setViewTime] = useState<ViewMode>('line')
  const [viewSource, setViewSource] = useState<ViewMode>('chart')
  const [viewStatus, setViewStatus] = useState<ViewMode>('chart')
  const [viewRep, setViewRep] = useState<ViewMode>('bar')
  const [viewLeaderboard, setViewLeaderboard] = useState<ViewMode>('bar')
  const [viewProductsInterest, setViewProductsInterest] = useState<ViewMode>('bar')
  const [viewConvertedProducts, setViewConvertedProducts] = useState<ViewMode>('bar')

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    checkAuth()
    fetchAnalytics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  async function checkAuth() {
    const roleName = role?.name ?? null
    setUserRole(roleName)

    if (roleName === 'tele_caller' || roleName === 'admin' || roleName === 'super_admin') {
      fetchFollowUpAlerts()
      const interval = setInterval(fetchFollowUpAlerts, 30 * 1000)
      return () => clearInterval(interval)
    }
  }

  async function fetchAnalytics() {
    try {
      const [analyticsRes, productsRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/products?with_stats=true'),
      ])
      if (analyticsRes.ok) {
        const data = await analyticsRes.json()
        setAnalytics(data)
      }
      if (productsRes.ok) {
        const products = await productsRes.json()
        setProductsWithStats(Array.isArray(products) ? products : [])
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Active leads: exclude lost, discarded, and conversion statuses (same as leads page)
  const ACTIVE_LEADS_EXCLUDE = ['lost', 'discarded', 'deal_won', 'converted', 'payment_pending', 'advance_received', 'fully_paid']
  const activeLeads = useMemo(() => {
    if (!analytics?.leadsByStatus) return 0
    return Object.entries(analytics.leadsByStatus).reduce(
      (sum, [status, count]) => (ACTIVE_LEADS_EXCLUDE.includes(status) ? sum : sum + count),
      0
    )
  }, [analytics])

  // Same data as products page: Leads Interested and Customers Bought per product
  const leadsInterestedByProductFromProducts = useMemo(
    () =>
      productsWithStats.map((p) => ({
        product_name: p.title,
        product_id: p.id,
        leads_count: p.leads_interested ?? 0,
      })),
    [productsWithStats]
  )
  const convertedLeadsByProductFromProducts = useMemo(
    () =>
      productsWithStats.map((p) => ({
        product_name: p.title,
        product_id: p.id,
        leads_count: p.customers_bought ?? 0,
      })),
    [productsWithStats]
  )
  const productsHeatMapData = useMemo(
    () =>
      productsWithStats.map((p) => ({
        product_name: p.title,
        product_id: p.id,
        leads_interested: p.leads_interested ?? 0,
        customers_bought: p.customers_bought ?? 0,
      })),
    [productsWithStats]
  )

  async function fetchFollowUpAlerts() {
    try {
      const response = await fetch('/api/followups/notifications')
      if (response.ok) {
        const data = await response.json()
        setFollowUpAlerts({
          overdue: data.overdue?.length || 0,
          upcoming: data.upcoming?.length || 0,
          adminNotifications: data.adminNotifications?.length || 0,
        })
      }
    } catch (error) {
      console.error('Failed to fetch follow-up alerts:', error)
    }
  }

  const timeOptions = viewOptions(['line', 'pie', 'table'])
  const chartTableOptions = viewOptions(['chart', 'table'])
  const repOptions = viewOptions(['bar', 'pie', 'table'])
  const leaderboardOptions = viewOptions(['bar', 'pie', 'table'])
  const productViewOptions = viewOptions(['bar', 'pie', 'heatmap', 'table'])

  return (
    <Layout>
      <div className="min-h-screen bg-white p-6 md:p-8" style={{ colorScheme: 'light' }}>
        <div className="mx-auto max-w-7xl">
          <motion.h1
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-poppins mb-2 text-3xl font-bold tracking-tight text-gray-900"
          >
            Dashboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-8 text-gray-500"
          >
            Overview of leads, conversions, and team performance
          </motion.p>

          {loading && (
            <div className="mb-8 space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-28 rounded-2xl border border-gray-200/80 bg-white shadow-sm"
                  >
                    <div className="flex h-full flex-col justify-center gap-3 p-6">
                      <div className="h-3 w-24 rounded-full bg-gray-200" />
                      <div className="h-8 w-16 rounded-lg bg-gray-200" />
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="h-80 rounded-2xl border border-gray-200/80 bg-white shadow-sm" />
                <div className="h-80 rounded-2xl border border-gray-200/80 bg-white shadow-sm" />
              </div>
            </div>
          )}

          {/* Follow-up Alerts for Tele-callers */}
          {userRole === 'tele_caller' && followUpAlerts && (followUpAlerts.overdue > 0 || followUpAlerts.upcoming > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 space-y-4"
            >
              {followUpAlerts.overdue > 0 && (
                <div className="rounded-xl border-l-4 border-red-400 bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        You have {followUpAlerts.overdue} overdue follow-up{followUpAlerts.overdue > 1 ? 's' : ''}!
                      </h3>
                      <p className="mt-1 text-sm text-red-700">
                        Please complete your overdue follow-ups as soon as possible.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {followUpAlerts.upcoming > 0 && (
                <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-amber-800">
                        {followUpAlerts.upcoming} upcoming follow-up{followUpAlerts.upcoming > 1 ? 's' : ''} in the next 24 hours
                      </h3>
                      <p className="mt-1 text-sm text-amber-700">
                        Make sure you&apos;re prepared for these scheduled calls.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Admin Follow-up Alerts */}
          {(userRole === 'admin' || userRole === 'super_admin') && followUpAlerts && (followUpAlerts.adminNotifications ?? 0) > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <div className="rounded-xl border-l-4 border-orange-400 bg-orange-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-orange-800">
                      {followUpAlerts.adminNotifications ?? 0} Follow-up{(followUpAlerts.adminNotifications ?? 0) > 1 ? 's' : ''} Pending for 1+ Day
                    </h3>
                    <p className="mt-1 text-sm text-orange-700">
                      There are follow-ups that have been pending for more than 1 day and need attention.
                    </p>
                    <Link
                      href="/followups"
                      className="mt-3 inline-block text-sm font-medium text-orange-800 underline"
                    >
                      View All Follow-ups →
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {!loading && (
            <>
              {/* KPI Cards - theme aligned */}
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                  index={0}
                  title="Active Leads"
                  value={activeLeads}
                  icon={<Users className="h-8 w-8 text-indigo-500" />}
                />
                <KPICard
                  index={1}
                  title="Conversion Rate"
                  value={analytics ? `${analytics.conversionRate.toFixed(1)}%` : '0%'}
                  icon={<TrendingUp className="h-8 w-8 text-emerald-500" />}
                />
                <KPICard
                  index={2}
                  title="Follow-up Compliance"
                  value={analytics ? `${analytics.followUpCompliance.toFixed(1)}%` : '0%'}
                  icon={<CheckCircle className="h-8 w-8 text-sky-500" />}
                />
                <KPICard
                  index={3}
                  title="SLA Breaches"
                  value={analytics ? analytics.slaBreaches : 0}
                  icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
                />
              </div>

              {/* Leaderboard */}
              {/* Leaderboard - Chart (bar) | List */}
              {analytics && analytics.repPerformance.length > 0 && (
                <div className="mb-8">
                  <DashboardCard
                    title="Leaderboard"
                    subtitle="Top performers by conversion rate"
                    viewMode={viewLeaderboard}
                    onViewModeChange={setViewLeaderboard}
                    viewOptions={leaderboardOptions}
                    sectionId="leaderboard"
                  >
                    {viewLeaderboard === 'bar' ? (
                      <LeaderboardBar data={analytics.repPerformance} maxItems={8} hideTitle />
                    ) : viewLeaderboard === 'pie' ? (
                      <LeaderboardPie data={analytics.repPerformance} maxItems={8} hideTitle />
                    ) : (
                      <Leaderboard data={analytics.repPerformance} maxItems={8} hideTitle />
                    )}
                  </DashboardCard>
                </div>
              )}

              {/* Leads over time - Line | Table */}
              {analytics?.leadsOverTime && analytics.leadsOverTime.length > 0 && (
                <div className="mb-8">
                  <DashboardCard
                    title="Leads & conversions over time"
                    subtitle="Daily trend for the selected period"
                    viewMode={viewTime}
                    onViewModeChange={setViewTime}
                    viewOptions={timeOptions}
                    sectionId="time"
                  >
                    {viewTime === 'line' ? (
                      <LeadsOverTimeLine data={analytics.leadsOverTime} hideTitle />
                    ) : viewTime === 'pie' ? (
                      <LeadsOverTimePie data={analytics.leadsOverTime} hideTitle />
                    ) : (
                      <LeadsOverTimeTable data={analytics.leadsOverTime} />
                    )}
                  </DashboardCard>
                </div>
              )}

              {/* Leads interested in products - same data as Products page */}
              <div className="mb-8">
                <DashboardCard
                  title="Leads interested in products"
                  subtitle="Leads whose requirement matches each product (same as Products page)"
                  viewMode={viewProductsInterest}
                  onViewModeChange={setViewProductsInterest}
                  viewOptions={productViewOptions}
                  sectionId="products-interest"
                >
                  {viewProductsInterest === 'bar' ? (
                    <LeadsInterestedByProductBar data={leadsInterestedByProductFromProducts} hideTitle />
                  ) : viewProductsInterest === 'pie' ? (
                    <LeadsInterestedByProductPie data={leadsInterestedByProductFromProducts} hideTitle />
                  ) : viewProductsInterest === 'heatmap' ? (
                    <ProductsHeatMap data={productsHeatMapData} hideTitle />
                  ) : (
                    <LeadsInterestedByProductTable data={leadsInterestedByProductFromProducts} />
                  )}
                </DashboardCard>
              </div>

              {/* Converted leads for products (Customers Bought) - same data as Products page */}
              <div className="mb-8">
                <DashboardCard
                  title="Converted leads for products"
                  subtitle="Customers who bought per product (same as Products page)"
                  viewMode={viewConvertedProducts}
                  onViewModeChange={setViewConvertedProducts}
                  viewOptions={productViewOptions}
                  sectionId="converted-products"
                >
                  {viewConvertedProducts === 'bar' ? (
                    <LeadsInterestedByProductBar data={convertedLeadsByProductFromProducts} hideTitle />
                  ) : viewConvertedProducts === 'pie' ? (
                    <LeadsInterestedByProductPie data={convertedLeadsByProductFromProducts} hideTitle countLabel="Customers bought" />
                  ) : viewConvertedProducts === 'heatmap' ? (
                    <ProductsHeatMap data={productsHeatMapData} hideTitle />
                  ) : (
                    <LeadsInterestedByProductTable data={convertedLeadsByProductFromProducts} countLabel="Customers bought" />
                  )}
                </DashboardCard>
              </div>

              {/* Leads by source & by status - Chart | Table */}
              <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DashboardCard
                  title="Leads by Source"
                  subtitle="Distribution by acquisition source"
                  viewMode={viewSource}
                  onViewModeChange={setViewSource}
                  viewOptions={chartTableOptions}
                  sectionId="source"
                >
                  {viewSource === 'chart' ? (
                    <LeadsBySourcePie data={analytics?.leadsBySource ?? {}} hideTitle />
                  ) : (
                    <LeadsBySourceTable data={analytics?.leadsBySource ?? {}} />
                  )}
                </DashboardCard>
                <DashboardCard
                  title="Leads by Status"
                  subtitle="Pipeline and lifecycle breakdown"
                  viewMode={viewStatus}
                  onViewModeChange={setViewStatus}
                  viewOptions={chartTableOptions}
                  sectionId="status"
                >
                  {viewStatus === 'chart' ? (
                    <LeadsByStatusPie data={analytics?.leadsByStatus ?? {}} hideTitle />
                  ) : (
                    <LeadsByStatusTable data={analytics?.leadsByStatus ?? {}} />
                  )}
                </DashboardCard>
              </div>

              {/* Rep performance - Chart (bar) | Table */}
              {analytics && analytics.repPerformance.length > 0 && (
                <div className="mb-8">
                  <DashboardCard
                    title="Rep performance"
                    subtitle="Total leads and conversion by rep"
                    viewMode={viewRep}
                    onViewModeChange={setViewRep}
                    viewOptions={repOptions}
                    sectionId="rep"
                  >
                    {viewRep === 'bar' ? (
                      <RepPerformanceBar data={analytics.repPerformance} hideTitle />
                    ) : viewRep === 'pie' ? (
                      <RepPerformancePie data={analytics.repPerformance} hideTitle />
                    ) : (
                      <RepPerformanceTable data={analytics.repPerformance} hideHeader />
                    )}
                  </DashboardCard>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

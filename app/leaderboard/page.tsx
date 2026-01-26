'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import Layout from '@/components/Layout'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { Trophy, TrendingUp, Users, Target, Medal, Award, Crown, BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface RepPerformance {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
  profile_image_url?: string | null
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

// Profile Image Component with fallback
function ProfileImage({ 
  imageUrl, 
  name, 
  size = 48 
}: { 
  imageUrl?: string | null
  name: string
  size?: number
}) {
  const [imgError, setImgError] = useState(false)
  
  if (imageUrl && !imgError) {
    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="rounded-full object-cover border-2 border-white shadow-md"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }
  
  // Fallback to initial avatar
  return (
    <div 
      className="rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-md border-2 border-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function LeaderBoardPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics()
  const [repPerformanceWithImages, setRepPerformanceWithImages] = useState<RepPerformance[]>([])
  const [chartViewMode, setChartViewMode] = useState<'line' | 'bar'>('line')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch profile images for reps
  useEffect(() => {
    async function fetchProfileImages() {
      if (!analytics?.repPerformance || analytics.repPerformance.length === 0) {
        setRepPerformanceWithImages([])
        return
      }

      const supabase = createClient()
      const userIds = analytics.repPerformance.map(rep => rep.user_id)
      
      const { data: users } = await supabase
        .from('users')
        .select('id, profile_image_url')
        .in('id', userIds)

      const userImageMap = new Map<string, string | null>()
      if (users) {
        users.forEach((u: any) => {
          userImageMap.set(u.id, u.profile_image_url || null)
        })
      }

      const repsWithImages = analytics.repPerformance.map(rep => ({
        ...rep,
        profile_image_url: userImageMap.get(rep.user_id) || null,
      }))

      // Sort by conversion rate (descending)
      repsWithImages.sort((a, b) => b.conversion_rate - a.conversion_rate)
      
      setRepPerformanceWithImages(repsWithImages)
    }

    if (analytics?.repPerformance) {
      fetchProfileImages()
    }
  }, [analytics])

  // Don't show anything if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null
  }

  // Prepare chart data
  const chartData = useMemo(() => {
    return repPerformanceWithImages.map((rep, index) => ({
      name: rep.user_name,
      'Total Leads': rep.total_leads,
      'Converted': rep.converted_leads,
      'Conversion Rate': parseFloat(rep.conversion_rate.toFixed(1)),
      rank: index + 1,
    }))
  }, [repPerformanceWithImages])

  // Get top 3 performers
  const topPerformers = repPerformanceWithImages.slice(0, 3)

  // Medal colors for top 3
  const medalColors = {
    1: { bg: 'from-yellow-400 to-yellow-600', icon: Crown, label: 'Gold' },
    2: { bg: 'from-gray-300 to-gray-500', icon: Medal, label: 'Silver' },
    3: { bg: 'from-orange-400 to-orange-600', icon: Award, label: 'Bronze' },
  }

  return (
    <Layout>
      <div className="p-6 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-8 h-8 text-yellow-500" />
              <h1 className="text-4xl font-bold text-gray-900">Leader Board</h1>
            </div>
            <p className="text-gray-600">Top performing tele-callers ranked by conversion rate</p>
          </div>

          {/* Loading State */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                  <div className="h-32 bg-gray-200 rounded mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          ) : repPerformanceWithImages.length > 0 ? (
            <>
              {/* Top 3 Podium */}
              {topPerformers.length >= 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  {/* 2nd Place */}
                  <div className="order-2 lg:order-1 flex flex-col items-center">
                    <div className="relative mb-4">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg border-4 border-white">
                        2
                      </div>
                      <Medal className="w-6 h-6 text-gray-500 absolute -top-1 -right-1" />
                    </div>
                    <ProfileImage 
                      imageUrl={topPerformers[1].profile_image_url}
                      name={topPerformers[1].user_name}
                      size={80}
                    />
                    <h3 className="text-xl font-bold text-gray-900 mt-4">{topPerformers[1].user_name}</h3>
                    <div className="mt-2 text-center">
                      <p className="text-sm text-gray-600">Conversion Rate</p>
                      <p className="text-2xl font-bold text-gray-900">{topPerformers[1].conversion_rate.toFixed(1)}%</p>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm text-gray-600">
                      <span>{topPerformers[1].total_leads} Leads</span>
                      <span>{topPerformers[1].converted_leads} Converted</span>
                    </div>
                  </div>

                  {/* 1st Place */}
                  <div className="order-1 lg:order-2 flex flex-col items-center">
                    <div className="relative mb-4">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl border-4 border-white">
                        1
                      </div>
                      <Crown className="w-8 h-8 text-yellow-500 absolute -top-2 -right-2" />
                    </div>
                    <ProfileImage 
                      imageUrl={topPerformers[0].profile_image_url}
                      name={topPerformers[0].user_name}
                      size={100}
                    />
                    <h3 className="text-2xl font-bold text-gray-900 mt-4">{topPerformers[0].user_name}</h3>
                    <div className="mt-2 text-center">
                      <p className="text-sm text-gray-600">Conversion Rate</p>
                      <p className="text-3xl font-bold text-yellow-600">{topPerformers[0].conversion_rate.toFixed(1)}%</p>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm text-gray-600">
                      <span>{topPerformers[0].total_leads} Leads</span>
                      <span>{topPerformers[0].converted_leads} Converted</span>
                    </div>
                  </div>

                  {/* 3rd Place */}
                  <div className="order-3 flex flex-col items-center">
                    <div className="relative mb-4">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg border-4 border-white">
                        3
                      </div>
                      <Award className="w-6 h-6 text-orange-500 absolute -top-1 -right-1" />
                    </div>
                    <ProfileImage 
                      imageUrl={topPerformers[2].profile_image_url}
                      name={topPerformers[2].user_name}
                      size={80}
                    />
                    <h3 className="text-xl font-bold text-gray-900 mt-4">{topPerformers[2].user_name}</h3>
                    <div className="mt-2 text-center">
                      <p className="text-sm text-gray-600">Conversion Rate</p>
                      <p className="text-2xl font-bold text-gray-900">{topPerformers[2].conversion_rate.toFixed(1)}%</p>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm text-gray-600">
                      <span>{topPerformers[2].total_leads} Leads</span>
                      <span>{topPerformers[2].converted_leads} Converted</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Overview - Line/Bar Graph with Animated Profile Images */}
              <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Performance Overview</h2>
                  <div className="flex items-center gap-3">
                    {/* Chart View Toggle */}
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setChartViewMode('line')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                          chartViewMode === 'line'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <LineChartIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Line</span>
                      </button>
                      <button
                        onClick={() => setChartViewMode('bar')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                          chartViewMode === 'bar'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <BarChart3 className="w-4 h-4" />
                        <span className="text-sm font-medium">Bar</span>
                      </button>
                    </div>
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </div>
                <div className="relative" style={{ height: '500px' }}>
                  {chartViewMode === 'line' ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 60, right: 30, left: 20, bottom: 80 }}>
                          <defs>
                            <linearGradient id="lineGradientTotal" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#667eea" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#764ba2" stopOpacity={1}/>
                            </linearGradient>
                            <linearGradient id="lineGradientConverted" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#059669" stopOpacity={1}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="name" 
                            stroke="#6b7280"
                            fontSize={12}
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
                          <Legend 
                            wrapperStyle={{ paddingTop: '20px' }}
                            formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                          />
                      <Line 
                        type="monotone" 
                        dataKey="Total Leads" 
                        stroke="url(#lineGradientTotal)" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        name="Total Leads"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Converted" 
                        stroke="url(#lineGradientConverted)" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 8, fill: '#10b981' }}
                        name="Converted"
                      />
                        </LineChart>
                      </ResponsiveContainer>
                      
                      {/* Profile Images at the tip of the line (data points) */}
                      <div className="absolute inset-0 pointer-events-none" style={{ marginTop: '60px', marginBottom: '80px', marginLeft: '20px', marginRight: '30px' }}>
                        {repPerformanceWithImages.map((rep, index) => {
                          // Calculate position based on chart data points
                          // X position: evenly spaced across the chart width
                          const totalDataPoints = chartData.length
                          const chartWidth = 100 // Percentage
                          const xSpacing = totalDataPoints > 1 ? chartWidth / (totalDataPoints - 1) : 0
                          const xPosition = index * xSpacing
                          
                          // Y position: based on "Converted" value (matching the green line endpoint)
                          // Get the max and min values for scaling
                          const maxConverted = Math.max(...chartData.map(d => d['Converted']))
                          const minConverted = Math.min(...chartData.map(d => d['Converted']))
                          const range = maxConverted - minConverted || 1
                          const chartHeight = 100 // Percentage
                          // Position based on converted leads value, inverted for CSS (top = 0)
                          const normalizedValue = (rep.converted_leads - minConverted) / range
                          const yPosition = chartHeight - (normalizedValue * chartHeight)
                          
                          return (
                            <div
                              key={rep.user_id}
                              className="absolute animate-float"
                              style={{
                                left: `${xPosition}%`,
                                top: `${yPosition}%`,
                                transform: 'translate(-50%, -50%)',
                                animationDelay: `${index * 0.3}s`,
                                zIndex: 10,
                              }}
                            >
                              <div className="relative group">
                                {/* Glow effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity animate-pulse" style={{ width: '70px', height: '70px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}></div>
                                {/* Profile Image */}
                                <ProfileImage 
                                  imageUrl={rep.profile_image_url}
                                  name={rep.user_name}
                                  size={56}
                                />
                                {/* Conversion Rate Badge */}
                                <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg whitespace-nowrap border-2 border-white">
                                  {rep.conversion_rate.toFixed(1)}%
                                </div>
                                {/* Rank Badge */}
                                <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-bold shadow-md whitespace-nowrap border-2 ${
                                  index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white border-yellow-300' :
                                  index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-500 text-white border-gray-200' :
                                  index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white border-orange-300' :
                                  'bg-white text-gray-700 border-gray-200'
                                }`}>
                                  #{index + 1}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 60, right: 30, left: 20, bottom: 80 }}>
                          <defs>
                            <linearGradient id="barGradientTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#667eea" stopOpacity={0.9}/>
                              <stop offset="95%" stopColor="#764ba2" stopOpacity={0.9}/>
                            </linearGradient>
                            <linearGradient id="barGradientConverted" x1="0" y1="0" x2="0" y2="1">
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
                          <Legend 
                            wrapperStyle={{ paddingTop: '20px' }}
                            formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                          />
                          <Bar 
                            dataKey="Total Leads" 
                            fill="url(#barGradientTotal)" 
                            radius={[8, 8, 0, 0]}
                            name="Total Leads"
                          />
                          <Bar 
                            dataKey="Converted" 
                            fill="url(#barGradientConverted)" 
                            radius={[8, 8, 0, 0]}
                            name="Converted"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      
                      {/* Profile Images at the top of bars */}
                      <div className="absolute inset-0 pointer-events-none" style={{ marginTop: '60px', marginBottom: '80px', marginLeft: '20px', marginRight: '30px' }}>
                        {repPerformanceWithImages.map((rep, index) => {
                          // Calculate position based on chart data points
                          const totalDataPoints = chartData.length
                          const chartWidth = 100 // Percentage
                          const xSpacing = totalDataPoints > 1 ? chartWidth / (totalDataPoints - 1) : 0
                          const xPosition = index * xSpacing
                          
                          // Y position: at the top of the "Converted" bar
                          const maxConverted = Math.max(...chartData.map(d => d['Converted']))
                          const minConverted = Math.min(...chartData.map(d => d['Converted']))
                          const range = maxConverted - minConverted || 1
                          const chartHeight = 100 // Percentage
                          const normalizedValue = (rep.converted_leads - minConverted) / range
                          const yPosition = chartHeight - (normalizedValue * chartHeight)
                          
                          return (
                            <div
                              key={rep.user_id}
                              className="absolute animate-float"
                              style={{
                                left: `${xPosition}%`,
                                top: `${yPosition}%`,
                                transform: 'translate(-50%, -50%)',
                                animationDelay: `${index * 0.3}s`,
                                zIndex: 10,
                              }}
                            >
                              <div className="relative group">
                                {/* Glow effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity animate-pulse" style={{ width: '70px', height: '70px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}></div>
                                {/* Profile Image */}
                                <ProfileImage 
                                  imageUrl={rep.profile_image_url}
                                  name={rep.user_name}
                                  size={56}
                                />
                                {/* Conversion Rate Badge */}
                                <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg whitespace-nowrap border-2 border-white">
                                  {rep.conversion_rate.toFixed(1)}%
                                </div>
                                {/* Rank Badge */}
                                <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-bold shadow-md whitespace-nowrap border-2 ${
                                  index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white border-yellow-300' :
                                  index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-500 text-white border-gray-200' :
                                  index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white border-orange-300' :
                                  'bg-white text-gray-700 border-gray-200'
                                }`}>
                                  #{index + 1}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Full Leaderboard Table */}
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Complete Rankings</h2>
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Rank
                        </th>
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
                      {repPerformanceWithImages.map((rep, index) => {
                        const rank = index + 1
                        const isTopThree = rank <= 3
                        return (
                          <tr 
                            key={rep.user_id} 
                            className={`hover:bg-gray-50 transition-colors duration-150 ${
                              isTopThree ? 'bg-gradient-to-r from-yellow-50 to-orange-50' : ''
                            }`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {rank === 1 && <Crown className="w-5 h-5 text-yellow-500" />}
                                {rank === 2 && <Medal className="w-5 h-5 text-gray-500" />}
                                {rank === 3 && <Award className="w-5 h-5 text-orange-500" />}
                                <span className={`text-sm font-bold ${
                                  rank === 1 ? 'text-yellow-600' :
                                  rank === 2 ? 'text-gray-600' :
                                  rank === 3 ? 'text-orange-600' :
                                  'text-gray-900'
                                }`}>
                                  #{rank}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <ProfileImage 
                                  imageUrl={rep.profile_image_url}
                                  name={rep.user_name}
                                  size={40}
                                />
                                <div>
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
                                <div className="w-32 bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-500 ${
                                      rank === 1 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                                      rank === 2 ? 'bg-gradient-to-r from-gray-400 to-gray-600' :
                                      rank === 3 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                                      'bg-gradient-to-r from-green-500 to-emerald-600'
                                    }`}
                                    style={{ width: `${Math.min(rep.conversion_rate, 100)}%` }}
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
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No performance data available</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

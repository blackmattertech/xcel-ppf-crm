'use client'

import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { rechartsTooltipNumber } from '@/components/dashboard/recharts-tooltip-value'

const BAR_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#22c55e', '#14b8a6', '#6366f1', '#8b5cf6', '#ec4899']

export interface LeaderboardBarEntry {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
}

interface LeaderboardBarProps {
  data: LeaderboardBarEntry[]
  maxItems?: number
  hideTitle?: boolean
}

export default function LeaderboardBar({ data, maxItems = 8, hideTitle }: LeaderboardBarProps) {
  const sorted = [...data]
    .filter((r) => r.total_leads > 0)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, maxItems)

  const chartData = sorted.map((r) => ({
    name: r.user_name.length > 14 ? r.user_name.slice(0, 12) + '…' : r.user_name,
    fullName: r.user_name,
    rate: Math.round(r.conversion_rate * 10) / 10,
    converted: r.converted_leads,
    total: r.total_leads,
  }))

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No leaderboard data</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Leaderboard (conversion rate)</h3>
      )}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#475569' }}
              axisLine={false}
              tickLine={false}
              angle={chartData.length > 4 ? -25 : 0}
              textAnchor={chartData.length > 4 ? 'end' : 'middle'}
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickFormatter={(v) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value, name) => {
                const v = rechartsTooltipNumber(value)
                const n = String(name ?? '')
                return [
                  n === 'rate' ? `${v}%` : v,
                  n === 'rate' ? 'Conversion rate' : n === 'converted' ? 'Converted' : 'Total leads',
                ]
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
            />
            <Bar
              dataKey="rate"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
              animationBegin={300}
              animationDuration={700}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

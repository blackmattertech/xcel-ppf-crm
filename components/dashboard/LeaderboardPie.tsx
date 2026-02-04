'use client'

import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const COLORS = [
  '#f59e0b', '#94a3b8', '#b45309', '#22c55e', '#14b8a6', '#6366f1', '#8b5cf6', '#ec4899',
]

export interface LeaderboardPieEntry {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
}

interface LeaderboardPieProps {
  data: LeaderboardPieEntry[]
  maxItems?: number
  hideTitle?: boolean
}

export default function LeaderboardPie({ data, maxItems = 8, hideTitle }: LeaderboardPieProps) {
  const sorted = [...data]
    .filter((r) => r.converted_leads > 0)
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, maxItems)

  const chartData = sorted.map((r) => ({
    name: r.user_name.length > 14 ? r.user_name.slice(0, 12) + '…' : r.user_name,
    fullName: r.user_name,
    value: r.converted_leads,
    rate: r.conversion_rate,
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
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Leaderboard (share of conversions)</h3>
      )}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              animationBegin={200}
              animationDuration={800}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value, 'Converted']}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload
                return p ? `${p.fullName} (${p.rate?.toFixed(1)}% rate)` : ''
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

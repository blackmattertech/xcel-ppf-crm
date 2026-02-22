'use client'

import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#14b8a6', '#f59e0b', '#ec4899']

interface RepRow {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
}

interface RepPerformanceBarProps {
  data: RepRow[]
  hideTitle?: boolean
}

export default function RepPerformanceBar({ data, hideTitle }: RepPerformanceBarProps) {
  const chartData = data.map((r) => ({
    name: r.user_name.length > 12 ? r.user_name.slice(0, 10) + '…' : r.user_name,
    fullName: r.user_name,
    leads: r.total_leads,
    converted: r.converted_leads,
    rate: r.conversion_rate,
  }))

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No rep performance data</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          Rep performance (leads)
        </h3>
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
              tick={{ fontSize: 12, fill: '#64748b' }}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value: number | undefined, name: string | undefined) => [
                value ?? 0,
                (name === 'leads' ? 'Total leads' : name === 'converted' ? 'Converted' : 'Rate'),
              ]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
            />
            <Bar
              dataKey="leads"
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

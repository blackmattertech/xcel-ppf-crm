'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'

interface DayPoint {
  date: string
  shortDate: string
  leads: number
  converted: number
}

interface LeadsOverTimeLineProps {
  data: Array<{ date: string; leads: number; converted: number }>
  hideTitle?: boolean
}

export default function LeadsOverTimeLine({ data, hideTitle }: LeadsOverTimeLineProps) {
  const chartData = useMemo<DayPoint[]>(() => {
    return data.map((d) => ({
      ...d,
      shortDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
  }, [data])

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[320px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No time-series data in this period</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          Leads & conversions over time
        </h3>
      )}
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="convertedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="shortDate"
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date && new Date(payload[0].payload.date).toLocaleDateString()}
              formatter={(value: number | undefined, name: string | undefined) => [
                value ?? 0,
                (name === 'leads' ? 'Leads' : 'Converted'),
              ]}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#leadsGrad)"
              animationBegin={400}
              animationDuration={1000}
            />
            <Line
              type="monotone"
              dataKey="converted"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
              animationBegin={600}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex gap-6 text-xs">
        <span className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-sm bg-indigo-500" />
          Leads
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-emerald-500" />
          Converted
        </span>
      </div>
    </motion.div>
  )
}

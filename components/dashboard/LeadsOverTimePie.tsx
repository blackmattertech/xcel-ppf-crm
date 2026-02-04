'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
]

interface LeadsOverTimePieProps {
  data: Array<{ date: string; leads: number; converted: number }>
  hideTitle?: boolean
}

export default function LeadsOverTimePie({ data, hideTitle }: LeadsOverTimePieProps) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.leads > 0)
      .map((d) => ({
        name: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: d.date,
        value: d.leads,
      }))
  }, [data])

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No time-series data in this period</p>
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
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Leads over time (share by day)</h3>
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
              formatter={(value: number | undefined) => [value ?? 0, 'Leads']}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelStyle={{ fontWeight: 600 }}
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

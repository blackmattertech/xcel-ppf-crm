'use client'

import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { LeadsInterestedByProductEntry } from './LeadsInterestedByProductBar'

const COLORS = [
  '#6366f1', '#8b5cf6', '#22c55e', '#14b8a6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16',
]

interface LeadsInterestedByProductPieProps {
  data: LeadsInterestedByProductEntry[]
  hideTitle?: boolean
  countLabel?: string
}

export default function LeadsInterestedByProductPie({
  data,
  hideTitle,
  countLabel = 'Leads interested',
}: LeadsInterestedByProductPieProps) {
  const chartData = data
    .filter((r) => r.leads_count > 0)
    .map((r) => ({
      name: r.product_name.length > 14 ? r.product_name.slice(0, 12) + '…' : r.product_name,
      fullName: r.product_name,
      value: r.leads_count,
    }))

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No product data yet</p>
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
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Share by product</h3>
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
              formatter={(value: number | undefined) => [value ?? 0, countLabel]}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid rgb(226 232 240)',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
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

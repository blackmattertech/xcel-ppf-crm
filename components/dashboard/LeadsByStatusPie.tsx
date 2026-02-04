'use client'

import { motion } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  new: '#6366f1',
  contacted: '#8b5cf6',
  qualified: '#22c55e',
  unqualified: '#94a3b8',
  quotation_shared: '#f59e0b',
  quotation_viewed: '#eab308',
  quotation_accepted: '#10b981',
  quotation_expired: '#f97316',
  interested: '#14b8a6',
  negotiation: '#a855f7',
  lost: '#ef4444',
  discarded: '#64748b',
  converted: '#059669',
  deal_won: '#0d9488',
  payment_pending: '#d946ef',
  advance_received: '#06b6d4',
  fully_paid: '#22c55e',
}

function formatLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface LeadsByStatusPieProps {
  data: Record<string, number>
  hideTitle?: boolean
}

export default function LeadsByStatusPie({ data, hideTitle }: LeadsByStatusPieProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name: formatLabel(name),
      value,
      color: STATUS_COLORS[name] ?? '#64748b',
    }))
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-[280px] items-center justify-center rounded-xl border border-gray-200/80 bg-gray-50/50"
      >
        <p className="text-sm text-slate-500">No status data in this period</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">
          Leads by Status
        </h3>
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
              animationBegin={300}
              animationDuration={800}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value, 'Leads']}
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

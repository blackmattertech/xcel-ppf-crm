'use client'

import { motion } from 'framer-motion'

interface KPICardProps {
  title: string
  value: string | number
  index?: number
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

export default function KPICard({ title, value, index = 0, icon, trend = 'neutral' }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow hover:shadow-md hover:border-gray-300/80"
    >
      <div className="absolute right-4 top-4 opacity-40 transition-opacity group-hover:opacity-70">
        {icon}
      </div>
      <p className="text-sm font-medium uppercase tracking-wider text-gray-500">
        {title}
      </p>
      <p className="mt-2 font-poppins text-3xl font-bold tabular-nums text-gray-900">
        {value}
      </p>
      {trend !== 'neutral' && (
        <span
          className={`mt-1 inline-block text-xs font-medium ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-gray-500'
          }`}
        >
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
        </span>
      )}
    </motion.div>
  )
}

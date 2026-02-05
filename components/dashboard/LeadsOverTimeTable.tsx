'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface LeadsOverTimeTableProps {
  data: Array<{ date: string; leads: number; converted: number }>
}

export default function LeadsOverTimeTable({ data }: LeadsOverTimeTableProps) {
  const rows = useMemo(() => {
    return [...data].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      ...d,
      dateFormatted: new Date(d.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    }))
  }, [data])

  if (rows.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-gray-500">
        <p className="text-sm">No time-series data in this period</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-3 font-semibold text-gray-700">Date</th>
            <th className="pb-3 text-right font-semibold text-gray-700">Leads</th>
            <th className="pb-3 text-right font-semibold text-gray-700">Converted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={row.date}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className="border-b border-gray-100 hover:bg-gray-50/80"
            >
              <td className="py-3 text-gray-900">{row.dateFormatted}</td>
              <td className="py-3 text-right tabular-nums text-gray-700">{row.leads}</td>
              <td className="py-3 text-right tabular-nums text-emerald-600">{row.converted}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

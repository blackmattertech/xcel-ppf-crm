'use client'

import { motion } from 'framer-motion'

interface LeadsBySourceTableProps {
  data: Record<string, number>
}

function formatSource(source: string): string {
  return source === 'undefined' || !source ? 'Unknown' : source.replace(/_/g, ' ')
}

export default function LeadsBySourceTable({ data }: LeadsBySourceTableProps) {
  const rows = Object.entries(data).sort(([, a], [, b]) => b - a)

  if (rows.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-gray-500">
        <p className="text-sm">No source data in this period</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-3 font-semibold text-gray-700">Source</th>
            <th className="pb-3 text-right font-semibold text-gray-700">Leads</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([source, count], i) => (
            <motion.tr
              key={source}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-gray-100 hover:bg-gray-50/80"
            >
              <td className="py-3 capitalize text-gray-900">{formatSource(source)}</td>
              <td className="py-3 text-right tabular-nums font-medium text-gray-700">{count}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

'use client'

import { motion } from 'framer-motion'

interface LeadsByStatusTableProps {
  data: Record<string, number>
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function LeadsByStatusTable({ data }: LeadsByStatusTableProps) {
  const rows = Object.entries(data)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  if (rows.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-gray-500">
        <p className="text-sm">No status data in this period</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-3 font-semibold text-gray-700">Status</th>
            <th className="pb-3 text-right font-semibold text-gray-700">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([status, count], i) => (
            <motion.tr
              key={status}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-gray-100 hover:bg-gray-50/80"
            >
              <td className="py-3 text-gray-900">{formatStatus(status)}</td>
              <td className="py-3 text-right tabular-nums font-medium text-gray-700">{count}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

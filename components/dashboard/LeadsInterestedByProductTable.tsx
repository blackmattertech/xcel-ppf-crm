'use client'

import { motion } from 'framer-motion'

export interface LeadsInterestedByProductEntry {
  product_name: string
  product_id: string
  leads_count: number
}

interface LeadsInterestedByProductTableProps {
  data: LeadsInterestedByProductEntry[]
  /** Optional column header for count (default: "Leads interested") */
  countLabel?: string
}

export default function LeadsInterestedByProductTable({ data, countLabel = 'Leads interested' }: LeadsInterestedByProductTableProps) {
  const rows = [...data].sort((a, b) => b.leads_count - a.leads_count)

  if (rows.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-gray-500">
        <p className="text-sm">No data in this period</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="pb-3 font-semibold text-gray-700">Product</th>
            <th className="pb-3 text-right font-semibold text-gray-700">{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={row.product_id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-gray-100 hover:bg-gray-50/80"
            >
              <td className="py-3 text-gray-900">{row.product_name}</td>
              <td className="py-3 text-right tabular-nums font-medium text-gray-700">{row.leads_count}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

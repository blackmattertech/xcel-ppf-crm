'use client'

import { motion } from 'framer-motion'

interface RepRow {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
}

interface RepPerformanceTableProps {
  data: RepRow[]
  hideHeader?: boolean
}

export default function RepPerformanceTable({ data, hideHeader }: RepPerformanceTableProps) {
  if (data.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl bg-white p-8 shadow-sm"
      >
        <p className="text-center text-sm text-gray-500">No rep performance data</p>
      </motion.div>
    )
  }

  const tableContent = (
    <div className="overflow-x-auto">
<table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50/80">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Rep
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Total leads
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Converted
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Conversion rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
          {data.map((rep, index) => (
            <motion.tr
              key={rep.user_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
              className="transition-colors hover:bg-gray-50/80"
            >
              <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-gray-900">
                {rep.user_name}
              </td>
<td className="whitespace-nowrap px-5 py-3 text-right text-sm tabular-nums text-gray-600">
                  {rep.total_leads}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-sm tabular-nums text-gray-600">
                {rep.converted_leads}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right">
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                  {rep.conversion_rate.toFixed(1)}%
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (hideHeader) {
    return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>{tableContent}</motion.div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm"
    >
      <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-4">
        <h3 className="font-poppins text-lg font-semibold text-gray-900">
          Rep performance
        </h3>
      </div>
      {tableContent}
    </motion.div>
  )
}

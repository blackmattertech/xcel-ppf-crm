'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

export interface ProductHeatMapRow {
  product_name: string
  product_id: string
  leads_interested: number
  customers_bought: number
}

interface ProductsHeatMapProps {
  /** Products with leads_interested and customers_bought (e.g. from /api/products?with_stats=true) */
  data: ProductHeatMapRow[]
  hideTitle?: boolean
}

function heatColor(value: number, max: number): string {
  if (max <= 0) return 'rgb(224 231 255)' // indigo-100
  const t = Math.min(1, value / max)
  // Interpolate indigo-100 -> indigo-600 (darker = higher)
  const r = Math.round(224 + (79 - 224) * t)
  const g = Math.round(231 + (70 - 231) * t)
  const b = Math.round(255 + (229 - 255) * t)
  return `rgb(${r} ${g} ${b})`
}

export default function ProductsHeatMap({ data, hideTitle }: ProductsHeatMapProps) {
  const { rows, maxLeads, maxCustomers } = useMemo(() => {
    const maxLeads = Math.max(1, ...data.map((p) => p.leads_interested ?? 0))
    const maxCustomers = Math.max(1, ...data.map((p) => p.customers_bought ?? 0))
    const rows = data.map((p) => ({
      name: p.product_name,
      shortName: p.product_name.length > 20 ? p.product_name.slice(0, 18) + '…' : p.product_name,
      leads_interested: p.leads_interested ?? 0,
      customers_bought: p.customers_bought ?? 0,
    }))
    return { rows, maxLeads, maxCustomers }
  }, [data])

  if (rows.length === 0) {
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={hideTitle ? '' : 'rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80'}
    >
      {!hideTitle && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Products heat map</h3>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 py-2 pr-3 text-left font-medium text-slate-600">
                Product
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-center font-medium text-slate-600">
                Leads interested
              </th>
              <th className="border-b border-slate-200 px-2 py-2 text-center font-medium text-slate-600">
                Customers bought
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="group">
                <td
                  className="border-b border-slate-100 py-2 pr-3 text-slate-800"
                  title={row.name}
                >
                  {row.shortName}
                </td>
                <td className="border-b border-slate-100 px-2 py-1">
                  <div
                    className="min-w-[60px] rounded-md px-2 py-1 text-center font-medium transition-colors"
                    style={{
                      backgroundColor: heatColor(row.leads_interested, maxLeads),
                      color: row.leads_interested > maxLeads * 0.4 ? '#fff' : '#3730a3',
                    }}
                  >
                    {row.leads_interested}
                  </div>
                </td>
                <td className="border-b border-slate-100 px-2 py-1">
                  <div
                    className="min-w-[60px] rounded-md px-2 py-1 text-center font-medium transition-colors"
                    style={{
                      backgroundColor: heatColor(row.customers_bought, maxCustomers),
                      color: row.customers_bought > maxCustomers * 0.4 ? '#fff' : '#3730a3',
                    }}
                  >
                    {row.customers_bought}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Darker = higher value. Scale is relative to the max in each column.
      </p>
    </motion.div>
  )
}

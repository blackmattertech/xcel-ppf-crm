'use client'

import { motion } from 'framer-motion'
import type { ViewMode } from './ViewSwitcher'
import ViewSwitcher from './ViewSwitcher'
import type { ViewOption } from './ViewSwitcher'

interface DashboardCardProps {
  title: string
  subtitle?: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  viewOptions: ViewOption[]
  sectionId: string
  children: React.ReactNode
  className?: string
}

export default function DashboardCard({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  viewOptions: options,
  sectionId,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm ${className}`}
    >
      <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-poppins text-lg font-semibold text-gray-900">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <ViewSwitcher
          value={viewMode}
          onChange={onViewModeChange}
          options={options}
          sectionId={sectionId}
        />
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  )
}

'use client'

import { motion } from 'framer-motion'
import { LineChart, Table2, PieChart, BarChart3, LayoutGrid } from 'lucide-react'

export type ViewMode = 'line' | 'table' | 'chart' | 'bar' | 'pie' | 'heatmap'

export interface ViewOption {
  id: ViewMode
  label: string
  icon: React.ReactNode
}

interface ViewSwitcherProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  options: ViewOption[]
  className?: string
  /** Unique id per section so the active pill doesn't animate across sections */
  sectionId?: string
}

const icons = {
  line: <LineChart className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
  chart: <PieChart className="h-4 w-4" />,
  bar: <BarChart3 className="h-4 w-4" />,
  pie: <PieChart className="h-4 w-4" />,
  heatmap: <LayoutGrid className="h-4 w-4" />,
}

export function viewOptions(
  modes: ViewMode[]
): ViewOption[] {
  const labels: Record<ViewMode, string> = {
    line: 'Line',
    table: 'Table',
    chart: 'Chart',
    bar: 'Bar',
    pie: 'Pie',
    heatmap: 'Heat map',
  }
  return modes.map((id) => ({ id, label: labels[id], icon: icons[id] }))
}

export default function ViewSwitcher({ value, onChange, options, className = '', sectionId = 'default' }: ViewSwitcherProps) {
  return (
    <div
      className={`inline-flex rounded-xl bg-gray-100 p-1 font-poppins ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const isActive = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={`view-switcher-${sectionId}`}
                className="absolute inset-0 rounded-lg bg-indigo-600"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

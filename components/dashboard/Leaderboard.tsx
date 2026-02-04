'use client'

import { motion } from 'framer-motion'
import { Trophy, Medal, Award, TrendingUp, Users } from 'lucide-react'

export interface LeaderboardEntry {
  user_id: string
  user_name: string
  total_leads: number
  converted_leads: number
  conversion_rate: number
}

interface LeaderboardProps {
  data: LeaderboardEntry[]
  title?: string
  subtitle?: string
  maxItems?: number
  /** When true, hide the inner header (use when inside DashboardCard) */
  hideTitle?: boolean
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, x: -16 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 260, damping: 20 },
  },
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-6 w-6 text-amber-500" />
  if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />
  if (rank === 3) return <Award className="h-6 w-6 text-amber-700" />
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
      {rank}
    </span>
  )
}

export default function Leaderboard({ data, title = 'Leaderboard', subtitle = 'Top performers by conversion', maxItems = 10, hideTitle = false }: LeaderboardProps) {
  const sorted = [...data]
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .filter((r) => r.total_leads > 0)
    .slice(0, maxItems)

  if (sorted.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl border border-gray-200/80 bg-white p-8 shadow-sm"
      >
        {!hideTitle && (
          <>
            <h3 className="font-poppins text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </>
        )}
        <p className="mt-6 text-center text-sm text-gray-500">No rep data yet</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-gray-200/80 bg-white shadow-sm overflow-hidden"
    >
      {!hideTitle && (
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-6 py-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h3 className="font-poppins text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        </div>
      )}
      <motion.ul
        variants={container}
        initial="hidden"
        animate="show"
        className="divide-y divide-gray-100"
      >
        {sorted.map((rep, index) => {
          const rank = index + 1
          return (
            <motion.li
              key={rep.user_id}
              variants={item}
              whileHover={{ backgroundColor: 'rgba(249, 250, 251, 1)', x: 4 }}
              transition={{ duration: 0.2 }}
              className="relative flex items-center gap-4 px-6 py-4 transition-colors overflow-hidden"
            >
              {/* Animated conversion rate bar (background) */}
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/8 to-transparent"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, rep.conversion_rate)}%` }}
                transition={{ duration: 0.8, delay: index * 0.06, ease: 'easeOut' }}
              />
              <div className="relative flex w-10 shrink-0 justify-center">
                <RankIcon rank={rank} />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{rep.user_name}</p>
                <p className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3" />
                    {rep.total_leads} leads
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3" />
                    {rep.converted_leads} converted
                  </span>
                </p>
              </div>
              <div className="relative shrink-0 text-right">
                <p className="font-poppins text-lg font-bold tabular-nums text-gray-900">
                  {rep.conversion_rate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">conv. rate</p>
              </div>
            </motion.li>
          )
        })}
      </motion.ul>
    </motion.div>
  )
}

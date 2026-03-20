'use client'

import Link from 'next/link'
import { FileText, MessageCircle, BarChart2, CalendarClock, ChevronRight, Sparkles } from 'lucide-react'

const featureCards = [
  {
    href: '/marketing/templates',
    title: 'Message templates',
    description: 'Create, edit, and sync templates with Meta for use in broadcasts.',
    icon: FileText,
    iconWrap: 'from-emerald-500/15 to-teal-600/10 text-emerald-700 ring-emerald-500/20',
    hoverBorder: 'hover:border-emerald-300/50 hover:shadow-emerald-500/10',
  },
  {
    href: '/marketing/bulk-whatsapp',
    title: 'Bulk WhatsApp',
    description: 'Send approved templates to segments or pasted lists with delivery tracking.',
    icon: MessageCircle,
    iconWrap: 'from-[#25D366]/20 to-[#128C7E]/10 text-[#128C7E] ring-[#25D366]/25',
    hoverBorder: 'hover:border-[#25D366]/40 hover:shadow-[#25D366]/15',
  },
  {
    href: '/marketing/whatsapp/scheduled',
    title: 'Scheduled broadcasts',
    description: 'Review queued jobs, contact counts, and edit pending send times.',
    icon: CalendarClock,
    iconWrap: 'from-violet-500/15 to-purple-600/10 text-violet-700 ring-violet-500/20',
    hoverBorder: 'hover:border-violet-300/50 hover:shadow-violet-500/10',
  },
  {
    href: '/marketing/whatsapp/analytics',
    title: 'Analytics',
    description: 'Volume, delivery funnel, template performance, and lead-level status.',
    icon: BarChart2,
    iconWrap: 'from-sky-500/15 to-blue-600/10 text-sky-700 ring-sky-500/20',
    hoverBorder: 'hover:border-sky-300/50 hover:shadow-sky-500/10',
  },
] as const

export default function MarketingWhatsAppPage() {
  return (
    <div className="space-y-8 pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#25D366]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
              <Sparkles className="h-3.5 w-3.5" />
              WhatsApp
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Marketing hub</h2>
            <p className="max-w-xl text-sm leading-relaxed text-slate-300">
              Templates, bulk sends, scheduling, and analytics — use the cards below to open each area.
            </p>
          </div>
        </div>
      </div>

      {/* Feature grid — primary navigation */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {featureCards.map(({ href, title, description, icon: Icon, iconWrap, hoverBorder }) => (
          <Link
            key={href}
            href={href}
            className={`group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-100/80 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${hoverBorder}`}
          >
            <div className="flex flex-1 flex-col gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 transition-transform duration-300 group-hover:scale-105 ${iconWrap}`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{description}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#128C7E] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Open
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

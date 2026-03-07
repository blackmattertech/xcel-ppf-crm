'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Layout from '@/components/Layout'
import { Megaphone, FileText, MessageCircle } from 'lucide-react'

const tabs = [
  { path: '/marketing/overview', label: 'Overview', icon: Megaphone },
  { path: '/marketing/templates', label: 'Message templates', icon: FileText },
  { path: '/marketing/bulk-whatsapp', label: 'Bulk WhatsApp', icon: MessageCircle },
] as const

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Marketing</h1>

        <nav className="flex rounded-xl bg-gray-100 p-1 mb-6 inline-flex flex-wrap gap-1">
          {tabs.map(({ path, label, icon: Icon }) => {
            const isActive = pathname === path
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>

        {children}
      </div>
    </Layout>
  )
}

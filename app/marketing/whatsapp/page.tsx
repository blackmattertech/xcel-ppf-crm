'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, MessageCircle, BarChart2 } from 'lucide-react'

const whatsappTabs = [
  { path: '/marketing/templates', label: 'Message templates', icon: FileText },
  { path: '/marketing/bulk-whatsapp', label: 'Bulk WhatsApp', icon: MessageCircle },
  { path: '/marketing/whatsapp/analytics', label: 'Analytics', icon: BarChart2 },
] as const

export default function MarketingWhatsAppPage() {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Manage WhatsApp message templates and run bulk broadcasts to your audience.
      </p>

      <nav className="flex rounded-xl bg-gray-100 p-1 mb-6 inline-flex flex-wrap gap-1">
        {whatsappTabs.map(({ path, label, icon: Icon }) => {
          const isActive = pathname === path || pathname?.startsWith(path + '/')
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/marketing/templates"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Message templates</h3>
            <p className="text-sm text-gray-500 mt-1">
              Create, edit, and manage WhatsApp message templates. Sync with Meta and use them in broadcasts.
            </p>
          </div>
        </Link>
        <Link
          href="/marketing/bulk-whatsapp"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="h-6 w-6 text-[#25D366]" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Bulk WhatsApp</h3>
            <p className="text-sm text-gray-500 mt-1">
              Send template messages to multiple contacts. Filter by segment and track delivery.
            </p>
          </div>
        </Link>
        <Link
          href="/marketing/whatsapp/analytics"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#34B7F1]/10 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="h-6 w-6 text-[#34B7F1]" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Analytics</h3>
            <p className="text-sm text-gray-500 mt-1">
              View all WhatsApp data: sent, received, delivery status, and template usage over time.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}

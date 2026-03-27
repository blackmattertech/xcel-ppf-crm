'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { cachedFetch } from '@/lib/api-client'

interface Quotation {
  id: string
  quote_number: string
  version: number
  total: number
  status: string
  lead: {
    name: string
    phone: string
  }
  created_at: string
}

export default function QuotationsPage() {
  const router = useRouter()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [totalLeads, setTotalLeads] = useState(0)

  useEffect(() => {
    checkAuth()
    fetchQuotations()
    fetchTotalLeads()
  }, [])

  async function fetchTotalLeads() {
    try {
      const response = await cachedFetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        setTotalLeads(data.leads?.length || 0)
      }
    } catch (error) {
      console.error('Failed to fetch total leads:', error)
    }
  }

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
    }
  }

  async function fetchQuotations() {
    try {
      const response = await cachedFetch('/api/quotations')
      if (response.ok) {
        const data = await response.json()
        setQuotations(data.quotations || [])
      }
    } catch (error) {
      console.error('Failed to fetch quotations:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 w-full">
        <div className="w-full">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 md:mb-8">Quotations</h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalLeads}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Quotations</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {quotations.length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quote Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotations.map((quote) => (
                  <tr key={quote.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {quote.quote_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {quote.lead?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      v{quote.version}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ₹{quote.total.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        quote.status === 'accepted' ? 'bg-green-100 text-green-800' :
                        quote.status === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      } capitalize`}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        href={`/quotations/${quote.id}`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}

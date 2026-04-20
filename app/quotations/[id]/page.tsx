'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { ArrowLeft, Download, Share2, Building2, User, Phone, Mail, Calendar, FileText } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

interface QuotationItem {
  name: string
  description?: string
  quantity: number
  unit_price: number
  total: number
}

interface Quotation {
  id: string
  quote_number: string
  version: number
  items: QuotationItem[]
  subtotal: number
  discount: number
  gst: number
  total: number
  validity_date: string
  status: string
  created_at: string
  lead: {
    id: string
    name: string
    phone: string
    email: string | null
  }
  created_by_user: {
    id: string
    name: string
    email: string
  }
}

export default function QuotationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const quotationId = params.id as string
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    fetchQuotation()
  }, [quotationId])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
    }
  }

  async function fetchQuotation() {
    try {
      const response = await cachedFetch(`/api/quotations/${quotationId}`)
      if (response.ok) {
        const data = await response.json()
        setQuotation(data.quotation)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch quotation')
      }
    } catch (error) {
      console.error('Error fetching quotation:', error)
      setError('Failed to fetch quotation')
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

  if (error || !quotation) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error || 'Quotation not found'}
            </div>
            <button
              onClick={() => router.push('/quotations')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Back to Quotations
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/quotations')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft size={20} />
              Back to Quotations
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Quotation Details</h1>
                <p className="text-gray-600 mt-1">Quote Number: {quotation.quote_number} (v{quotation.version})</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const shareUrl = window.location.href
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: 'Quotation',
                          text: `Check out this quotation for ${quotation.lead.name}`,
                          url: shareUrl
                        })
                      } else {
                        await navigator.clipboard.writeText(shareUrl)
                        alert('Quotation link copied to clipboard!')
                      }
                    } catch (error) {
                      try {
                        await navigator.clipboard.writeText(shareUrl)
                        alert('Quotation link copied to clipboard!')
                      } catch (copyError) {
                        console.error('Failed to copy link:', copyError)
                      }
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Share2 size={18} />
                  Share
                </button>
                <button
                  onClick={() => {
                    window.print()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download size={18} />
                  Download PDF
                </button>
              </div>
            </div>
          </div>

          {/* Quotation Card */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Company Header */}
            <div className="bg-gradient-to-r from-[#de0510] to-[#ff1a24] text-white px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Ultrakool</h2>
                  <p className="text-white/90 text-sm">Professional Paint Protection Films</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white/90">Quote Number</p>
                  <p className="text-xl font-bold">{quotation.quote_number}</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {/* Customer & Company Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Company Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Building2 size={16} />
                    From
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-gray-900">Ultrakool</p>
                    <p className="text-gray-600">info@ultrakool.com</p>
                    <p className="text-gray-600">+91 1234567890</p>
                    <p className="text-gray-600">Your Company Address</p>
                    <p className="text-gray-600">GSTIN: 29ABCDE1234F1Z5</p>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <User size={16} />
                    To
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-gray-900">{quotation.lead.name}</p>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone size={14} />
                      <span>{quotation.lead.phone}</span>
                    </div>
                    {quotation.lead.email && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail size={14} />
                        <span>{quotation.lead.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quotation Details */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={18} className="text-gray-600" />
                  <div className="text-sm">
                    <span className="text-gray-600">Created:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {new Date(quotation.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <span className="text-gray-400 mx-2">•</span>
                  <div className="text-sm">
                    <span className="text-gray-600">Valid Until:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {new Date(quotation.validity_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={18} />
                  Items
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {quotation.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {item.name}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">
                            {item.description || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                            ₹{item.unit_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                            ₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="max-w-md ml-auto space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-900">
                      ₹{quotation.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {quotation.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Discount:</span>
                      <span className="font-medium text-gray-900">
                        - ₹{quotation.discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">GST:</span>
                    <span className="font-medium text-gray-900">
                      ₹{quotation.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-gray-300">
                    <span className="text-lg font-semibold text-gray-900">Total:</span>
                    <span className="text-xl font-bold text-[#de0510]">
                      ₹{quotation.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    quotation.status === 'accepted' ? 'bg-green-100 text-green-800' :
                    quotation.status === 'expired' ? 'bg-red-100 text-red-800' :
                    quotation.status === 'viewed' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  } capitalize`}>
                    {quotation.status}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Created by: {quotation.created_by_user.name || quotation.created_by_user.email}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

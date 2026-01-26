'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  lead_id: string | null
  created_at: string
  updated_at: string
}

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  created_at: string
}

interface LeadMetadata {
  meta_data: Record<string, any> | null
  campaign_id: string | null
  ad_id: string | null
  adset_id: string | null
  form_id: string | null
  form_name: string | null
  ad_name: string | null
  campaign_name: string | null
  source: string | null
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string
  
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [leadMetadata, setLeadMetadata] = useState<LeadMetadata | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
    fetchCustomer()
  }, [customerId])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
    }
  }

  async function fetchCustomer() {
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      if (response.ok) {
        const data = await response.json()
        setCustomer(data.customer)
        setOrders(data.orders || [])
        setLeadMetadata(data.leadMetadata || null)
      } else {
        alert('Customer not found')
        router.push('/customers')
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error)
      alert('Failed to load customer details')
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

  if (!customer) {
    return null
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-4 text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Back to Customers
          </button>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Customer Details</h1>

          {/* Customer Information */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Customer Information</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm font-bold text-gray-900">{customer.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="mt-1 text-sm text-gray-900">{customer.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{customer.email || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Customer Type</label>
                  <span className="mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                    {customer.customer_type.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(customer.created_at).toLocaleString()}
                  </p>
                </div>
                {customer.lead_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Lead ID</label>
                    <button
                      onClick={() => router.push(`/leads/${customer.lead_id}`)}
                      className="mt-1 text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      View Lead
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lead Metadata */}
          {leadMetadata && leadMetadata.meta_data && Object.keys(leadMetadata.meta_data).length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Lead Metadata</h2>
                <p className="text-sm text-gray-500 mt-1">Original lead information from when this customer was a lead</p>
              </div>
              <div className="px-6 py-4">
                {/* Campaign Information */}
                {(leadMetadata.campaign_name || leadMetadata.ad_name || leadMetadata.form_name) && (
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Campaign Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {leadMetadata.source && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">Source</label>
                          <p className="mt-1 text-sm text-gray-900 capitalize">{leadMetadata.source}</p>
                        </div>
                      )}
                      {leadMetadata.campaign_name && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">Campaign</label>
                          <p className="mt-1 text-sm text-gray-900">{leadMetadata.campaign_name}</p>
                        </div>
                      )}
                      {leadMetadata.ad_name && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">Ad Name</label>
                          <p className="mt-1 text-sm text-gray-900">{leadMetadata.ad_name}</p>
                        </div>
                      )}
                      {leadMetadata.form_name && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">Form Name</label>
                          <p className="mt-1 text-sm text-gray-900">{leadMetadata.form_name}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Full Metadata */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">All Metadata Fields</h3>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(leadMetadata.meta_data)
                        .filter(([key]) => {
                          // Exclude internal/system fields
                          return key !== 'platform' && 
                                 key !== 'Platform' &&
                                 key !== 'customer_id'
                        })
                        .map(([key, value]) => {
                          const displayKey = key.replace(/_/g, ' ').replace(/\?/g, '').replace(/^\w/, c => c.toUpperCase())
                          let displayValue: string
                          
                          if (value === null || value === undefined) {
                            displayValue = '-'
                          } else if (typeof value === 'object') {
                            displayValue = JSON.stringify(value, null, 2)
                          } else {
                            displayValue = String(value)
                          }
                          
                          return (
                            <div key={key} className="border-b border-gray-200 pb-3 last:border-0">
                              <div className="text-xs font-medium text-gray-700 mb-1">{displayKey}</div>
                              <div className="text-sm text-gray-900 break-words whitespace-pre-wrap">
                                {displayValue}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                    {Object.keys(leadMetadata.meta_data).length === 0 && (
                      <p className="text-sm text-gray-500">No metadata available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Orders */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {order.order_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 capitalize">
                            {order.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                            {order.payment_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => router.push(`/orders/${order.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

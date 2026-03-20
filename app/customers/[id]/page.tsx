'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { cachedFetch } from '@/lib/api-client'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  tags: string[] | null
  lead_id: string | null
  created_at: string
  updated_at: string
  source?: 'external'
  car_number?: string | null
  chassis_number?: string | null
  service_type?: string | null
  series?: string | null
  service_date?: string | null
  service_location?: string | null
  dealer_name?: string | null
  warranty_years?: number | null
  ppf_warranty_years?: number | null
  car_name?: string | null
  car_model?: string | null
  car_photo_url?: string | null
  chassis_photo_url?: string | null
  dealer_invoice_url?: string | null
}

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  created_at: string
  lead?: {
    payment_amount: string | null
  } | null
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string
  
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
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
      const response = await cachedFetch(`/api/customers/${customerId}`)
      if (response.ok) {
        const data = await response.json()
        setCustomer(data.customer)
        setOrders(data.orders || [])
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

  const uiType = (() => {
    const tags = customer.tags || []
    if (tags.some((t) => t.toLowerCase().includes('dealership'))) return 'Dealership'
    if (tags.some((t) => t.toLowerCase().includes('individual'))) return 'Individual'
    return 'Individual'
  })()

  const totalRevenue = orders.reduce((sum, order) => {
    const isClosed = order.payment_status === 'fully_paid'
    const amount = order.lead?.payment_amount ? Number(order.lead.payment_amount) : 0
    if (!isClosed || !amount || Number.isNaN(amount)) return sum
    return sum + amount
  }, 0)

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
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">Customer Information</h2>
              {customer.source === 'external' && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Warranty Claims</span>
              )}
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
                  <span className="mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {uiType}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(customer.created_at).toLocaleString()}
                  </p>
                </div>
                {customer.source !== 'external' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Purchase Value</label>
                    <p className="mt-1 text-sm font-semibold text-green-700">
                      ₹{totalRevenue.toLocaleString('en-IN')}
                    </p>
                  </div>
                )}
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

          {/* Car & Service (external/claims) */}
          {(customer.source === 'external' && (customer.car_number || customer.car_name || customer.service_type || customer.dealer_name)) && (
            <>
              <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Car Details</h2>
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customer.car_name != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Car Name</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.car_name}</p>
                      </div>
                    )}
                    {customer.car_model != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Car Model</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.car_model}</p>
                      </div>
                    )}
                    {customer.car_number != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Car Number</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.car_number}</p>
                      </div>
                    )}
                    {customer.chassis_number != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Chassis Number</label>
                        <p className="mt-1 text-sm text-gray-900 font-mono text-xs">{customer.chassis_number}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Service Details</h2>
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customer.service_type != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Service Type</label>
                        <p className="mt-1 text-sm text-gray-900 capitalize">{customer.service_type}</p>
                      </div>
                    )}
                    {customer.series != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Series</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.series}</p>
                      </div>
                    )}
                    {customer.service_date != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Service Date</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.service_date}</p>
                      </div>
                    )}
                    {customer.service_location != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Service Location</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.service_location}</p>
                      </div>
                    )}
                    {customer.dealer_name != null && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Dealer Name</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.dealer_name}</p>
                      </div>
                    )}
                    {customer.warranty_years != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Warranty (years)</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.warranty_years}</p>
                      </div>
                    )}
                    {customer.ppf_warranty_years != null && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">PPF Warranty (years)</label>
                        <p className="mt-1 text-sm text-gray-900">{customer.ppf_warranty_years}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {(customer.car_photo_url || customer.chassis_photo_url || customer.dealer_invoice_url) && (
                <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">Images</h2>
                  </div>
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {customer.car_photo_url && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Car Photo</label>
                          <a href={customer.car_photo_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-gray-200 overflow-hidden hover:opacity-90">
                            <img src={customer.car_photo_url} alt="Car" className="w-full h-48 object-cover" />
                          </a>
                        </div>
                      )}
                      {customer.chassis_photo_url && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Chassis Photo</label>
                          <a href={customer.chassis_photo_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-gray-200 overflow-hidden hover:opacity-90">
                            <img src={customer.chassis_photo_url} alt="Chassis" className="w-full h-48 object-cover" />
                          </a>
                        </div>
                      )}
                      {customer.dealer_invoice_url && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Dealer Invoice</label>
                          <a href={customer.dealer_invoice_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-gray-200 overflow-hidden hover:opacity-90">
                            {customer.dealer_invoice_url.toLowerCase().endsWith('.pdf') ? (
                              <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-500">
                                PDF – click to open
                              </div>
                            ) : (
                              <img src={customer.dealer_invoice_url} alt="Dealer invoice" className="w-full h-48 object-cover" />
                            )}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
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

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { cachedFetch } from '@/lib/api-client'

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  customer_id: string
  lead_id: string | null
  assigned_team: string | null
  created_at: string
  updated_at: string
  customer: {
    id: string
    name: string
    phone: string
    email: string | null
  }
  lead: {
    id: string
    requirement: string | null
    meta_data: Record<string, any> | null
  } | null
}

interface UserDataWithRole {
  role_id: string
  roles: {
    name: string
  } | null
}

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string
  
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [orderStatus, setOrderStatus] = useState('')
  const [submittingStatus, setSubmittingStatus] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchOrder()
  }, [orderId])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()

    if (userData) {
      const typedUserData = userData as UserDataWithRole
      const roleName = typedUserData.roles?.name || null
      setUserRole(roleName)
    }
  }

  async function fetchOrder() {
    try {
      const response = await cachedFetch(`/api/orders/${orderId}`)
      if (response.ok) {
        const data = await response.json()
        setOrder(data.order)
      } else {
        alert('Order not found')
        router.push('/orders')
      }
    } catch (error) {
      console.error('Failed to fetch order:', error)
      alert('Failed to load order details')
    } finally {
      setLoading(false)
    }
  }

  async function handlePaymentUpdate() {
    if (!paymentStatus) {
      alert('Please select a payment status')
      return
    }

    setSubmittingPayment(true)
    try {
      const response = await cachedFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: paymentStatus,
        }),
      })

      if (response.ok) {
        await fetchOrder()
        setShowPaymentModal(false)
        setPaymentStatus('')
        alert('Payment status updated successfully')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update payment status')
      }
    } catch (error) {
      console.error('Failed to update payment:', error)
      alert(error instanceof Error ? error.message : 'Failed to update payment status')
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function handleStatusUpdate() {
    if (!orderStatus) {
      alert('Please select an order status')
      return
    }

    setSubmittingStatus(true)
    try {
      const response = await cachedFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: orderStatus,
        }),
      })

      if (response.ok) {
        await fetchOrder()
        setShowStatusModal(false)
        setOrderStatus('')
        alert('Order status updated successfully')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update order status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      alert(error instanceof Error ? error.message : 'Failed to update order status')
    } finally {
      setSubmittingStatus(false)
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

  if (!order) {
    return null
  }

  const canUpdatePayment = userRole === 'tele_caller' || userRole === 'admin' || userRole === 'super_admin'

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-4 text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Back to Orders
          </button>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Order Details</h1>

          {/* Order Information */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Order Information</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Order Number</label>
                  <p className="mt-1 text-sm text-gray-900 font-medium">{order.order_number}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Product</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {(() => {
                      // Get product from requirement or meta_data
                      let product = order.lead?.requirement || null
                      
                      // If not in requirement, check meta_data for "what_services_are_you_looking_for?"
                      if (!product && order.lead?.meta_data) {
                        product = order.lead.meta_data['what_services_are_you_looking_for?'] || 
                                 order.lead.meta_data['what_services_are_you_looking_for'] ||
                                 null
                      }
                      
                      // Format the product name (replace underscores with spaces, capitalize)
                      if (product) {
                        return product
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l) => l.toUpperCase())
                      }
                      
                      return '-'
                    })()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <span className="mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 capitalize">
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Payment Status</label>
                  <span className={`mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                    order.payment_status === 'fully_paid' 
                      ? 'bg-green-100 text-green-800'
                      : order.payment_status === 'advance_received'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {order.payment_status.replace('_', ' ')}
                  </span>
                </div>
                {order.assigned_team && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Assigned Team</label>
                    <p className="mt-1 text-sm text-gray-900">{order.assigned_team}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(order.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          {order.customer && (
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Customer Information</h2>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <p className="mt-1 text-sm font-bold text-gray-900">{order.customer.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <p className="mt-1 text-sm text-gray-900">{order.customer.phone}</p>
                  </div>
                  {order.customer.email && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="mt-1 text-sm text-gray-900">{order.customer.email}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Actions</label>
                    <button
                      onClick={() => router.push(`/customers/${order.customer_id}`)}
                      className="mt-1 text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      View Customer Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Status and Payment Status Update (for tele_callers) */}
          {canUpdatePayment && (
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Update Order</h2>
              </div>
              <div className="px-6 py-4 flex gap-4">
                <button
                  onClick={() => setShowStatusModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Update Order Status
                </button>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                >
                  Update Payment Status
                </button>
              </div>
            </div>
          )}

          {/* Order Status Modal */}
          {showStatusModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Update Order Status</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order Status
                    </label>
                    <select
                      value={orderStatus}
                      onChange={(e) => setOrderStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select status...</option>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowStatusModal(false)
                        setOrderStatus('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingStatus}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleStatusUpdate}
                      disabled={submittingStatus || !orderStatus}
                      className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingStatus ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment Status Modal */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Update Payment Status</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Status
                    </label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select status...</option>
                      <option value="pending">Payment Pending</option>
                      <option value="advance_received">Advance Received</option>
                      <option value="fully_paid">Fully Paid</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowPaymentModal(false)
                        setPaymentStatus('')
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                      disabled={submittingPayment}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePaymentUpdate}
                      disabled={submittingPayment || !paymentStatus}
                      className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingPayment ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

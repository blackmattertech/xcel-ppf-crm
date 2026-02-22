'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Layout from '@/components/Layout'
import FacebookIntegration from '@/components/FacebookIntegration'
import { useAuthContext } from '@/components/AuthProvider'
import { CheckCircle2, XCircle } from 'lucide-react'

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, loading: authLoading } = useAuthContext()
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check for success/error messages in URL params
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const integration = searchParams.get('integration')

    if (success && integration === 'facebook') {
      setNotification({
        type: 'success',
        message: 'Facebook Business account connected successfully!',
      })
      // Clear URL params
      router.replace('/settings', { scroll: false })
    } else if (error && integration === 'facebook') {
      const errorMessages: Record<string, string> = {
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        no_access_token: 'No access token received from Facebook. Please try again.',
        save_failed: 'Failed to save Facebook connection. Please try again.',
        update_failed: 'Failed to update Facebook connection. Please try again.',
        callback_failed: 'Failed to process Facebook callback. Please try again.',
        facebook_not_configured: 'Facebook integration is not configured. Please contact your administrator.',
      }
      setNotification({
        type: 'error',
        message: errorMessages[error] || 'An error occurred while connecting Facebook.',
      })
      // Clear URL params
      router.replace('/settings', { scroll: false })
    }
  }, [isAuthenticated, authLoading, router, searchParams])

  useEffect(() => {
    // Auto-dismiss notification after 5 seconds
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  if (authLoading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600">Manage your integrations and account settings</p>
        </div>

        {notification && (
          <div
            className={`p-4 rounded-md flex items-center gap-3 ${
              notification.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Integrations</h2>
            <div className="space-y-4">
              <FacebookIntegration />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="p-6">
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading...</div>
            </div>
          </div>
        </Layout>
      }
    >
      <SettingsContent />
    </Suspense>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { WifiOff, RefreshCw, Home } from 'lucide-react'

export default function OfflinePage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    // Check online status
    const checkOnline = () => {
      setIsOnline(navigator.onLine)
    }

    checkOnline()

    // Listen for online/offline events
    window.addEventListener('online', checkOnline)
    window.addEventListener('offline', checkOnline)

    return () => {
      window.removeEventListener('online', checkOnline)
      window.removeEventListener('offline', checkOnline)
    }
  }, [])

  const handleRetry = () => {
    if (navigator.onLine) {
      router.refresh()
      router.push('/')
    } else {
      // Force reload to check connection
      window.location.reload()
    }
  }

  const handleGoHome = () => {
    router.push('/')
  }

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <WifiOff className="w-10 h-10 text-gray-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            You're Offline
          </h1>

          <p className="text-gray-600 mb-6">
            {isOnline
              ? 'Connection restored! You can now continue using the app.'
              : 'It looks like you\'re not connected to the internet. Please check your connection and try again.'}
          </p>

          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#de0510] text-white rounded-lg font-medium hover:bg-[#c00410] transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              {isOnline ? 'Refresh Page' : 'Retry Connection'}
            </button>

            <button
              onClick={handleGoHome}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              <Home className="w-5 h-5" />
              Go to Home
            </button>
          </div>

          {!isOnline && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Some features may be available offline thanks to our Progressive Web App technology.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

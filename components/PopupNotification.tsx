'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useFollowUpNotifications } from '@/hooks/useFollowUpNotifications'

export default function PopupNotification() {
  const { user } = useAuth()
  const [showPopup, setShowPopup] = useState(false)
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const userRole = user?.role || null
  const isTeleCaller = userRole === 'tele_caller'
  
  // Use shared hook - React Query will handle caching and deduplication
  const { data: notifications } = useFollowUpNotifications(isTeleCaller)

  // Show popup when overdue follow-ups are detected
  useEffect(() => {
    if (notifications && notifications.overdue.length > 0) {
      const hasOverdue = notifications.overdue.length > 0
      const currentTime = Date.now()
      
      // Show popup if there are overdue follow-ups and we haven't shown one in the last 10 minutes
      if (hasOverdue && (currentTime - lastNotificationTime > 10 * 60 * 1000)) {
        setShowPopup(true)
        setLastNotificationTime(currentTime)
        
        // Request browser notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission()
        }
        
        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Overdue Follow-ups', {
            body: `You have ${notifications.overdue.length} overdue follow-up${notifications.overdue.length > 1 ? 's' : ''} that need attention.`,
            icon: '/favicon.ico',
            tag: 'followup-notification',
          })
        }
      }
    }
  }, [notifications, lastNotificationTime])

  // Play notification sound when popup shows
  useEffect(() => {
    if (showPopup && notifications && notifications.overdue.length > 0) {
      try {
        // Create audio element with your custom notification sound
        audioRef.current = new Audio('/notification.wav')
        audioRef.current.loop = true // Loop continuously
        audioRef.current.volume = 0.7 // Set volume (0.0 to 1.0)
        
        // Play the sound
        audioRef.current.play().catch((error) => {
          console.error('Failed to play notification sound:', error)
          // Some browsers require user interaction before playing audio
          // The sound will play once user interacts with the page
        })
      } catch (error) {
        console.error('Failed to create audio element:', error)
      }
    }
    
    return () => {
      // Cleanup: stop and remove audio when popup is dismissed
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
    }
  }, [showPopup, notifications])

  const userRole = role?.name ?? null

  // Only show for tele-callers with overdue follow-ups
  if (!isTeleCaller || !showPopup || !notifications || notifications.overdue.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-white rounded-lg shadow-2xl border-2 border-red-500 p-6 animate-slide-up animate-blink-alert">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Overdue Follow-ups
              </h3>
              <p className="text-sm text-gray-600">
                You have {notifications.overdue.length} overdue follow-up{notifications.overdue.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              // Stop audio when dismissed
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.currentTime = 0
                audioRef.current = null
              }
              setShowPopup(false)
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {notifications.overdue.slice(0, 3).map((followUp) => (
            <div key={followUp.id} className="bg-red-50 p-3 rounded border border-red-200">
              <Link
                href={`/leads/${followUp.lead?.id}`}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 block"
              >
                {followUp.lead?.name || 'Unknown Lead'}
              </Link>
              <p className="text-xs text-gray-600 mt-1">
                Scheduled: {new Date(followUp.scheduled_at).toLocaleString()}
              </p>
            </div>
          ))}
          {notifications.overdue.length > 3 && (
            <p className="text-xs text-gray-500 text-center">
              +{notifications.overdue.length - 3} more overdue follow-up{notifications.overdue.length - 3 > 1 ? 's' : ''}
            </p>
          )}
        </div>
        
        <div className="flex gap-2">
          <Link
            href="/followups"
            onClick={() => {
              // Stop audio when navigating
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.currentTime = 0
                audioRef.current = null
              }
              setShowPopup(false)
            }}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-medium text-center"
          >
            View All Follow-ups
          </Link>
          <button
            onClick={() => {
              // Stop audio when dismissed
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.currentTime = 0
                audioRef.current = null
              }
              setShowPopup(false)
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

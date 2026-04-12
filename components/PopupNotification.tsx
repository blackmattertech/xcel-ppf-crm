'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuthContext } from './AuthProvider'
import { useFollowupNotifications } from './FollowupNotificationsProvider'
import { isAssignedOnlyFollowUpsRole } from '@/shared/constants/roles'

export default function PopupNotification() {
  const { role } = useAuthContext()
  const { data: notifications } = useFollowupNotifications()
  const [showPopup, setShowPopup] = useState(false)
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedSoundRef = useRef(false)

  const userRole = role?.name ?? null
  const showForRole = isAssignedOnlyFollowUpsRole(userRole)

  // Decide when to surface the popup based on shared notifications data.
  useEffect(() => {
    if (!showForRole || !notifications) return

    const hasOverdue = (notifications.overdue?.length || 0) > 0
    if (!hasOverdue) return

    const currentTime = Date.now()
    if (currentTime - lastNotificationTime > 10 * 60 * 1000) {
      // Defer state updates to avoid calling setState synchronously inside the effect
      setTimeout(() => {
        setShowPopup(true)
        setLastNotificationTime(currentTime)
      }, 0)

      // Show browser notification only if user already granted (do NOT call requestPermission here –
      // it must be from a user gesture; use sidebar "Enable push notifications" instead)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Overdue Follow-ups', {
          body: `You have ${notifications.overdue.length} overdue follow-up${notifications.overdue.length > 1 ? 's' : ''} that need attention.`,
          icon: '/icon-192x192.png',
          tag: 'followup-notification',
        })
      }
    }
  }, [showForRole, notifications, lastNotificationTime])

  // Prepare audio for playback. Don't auto-play: browsers block audio unless triggered by user gesture (NotAllowedError).
  // Sound can be played on first user click on the popup (see onClick on the container below).
  useEffect(() => {
    if (showPopup && notifications && notifications.overdue.length > 0) {
      audioRef.current = new Audio('/notification.wav')
      audioRef.current.loop = true
      audioRef.current.volume = 0.7
    }
    return () => {
      hasPlayedSoundRef.current = false
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
    }
  }, [showPopup, notifications])

  // Only show for tele-callers/sales with overdue follow-ups
  if (!showForRole || !showPopup || !notifications || notifications.overdue.length === 0) {
    return null
  }

  function playSoundOnce() {
    if (hasPlayedSoundRef.current || !audioRef.current) return
    hasPlayedSoundRef.current = true
    audioRef.current.play().catch(() => {})
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div
        role="dialog"
        className="bg-white rounded-lg shadow-2xl border-2 border-red-500 p-6 animate-slide-up animate-blink-alert"
        onClick={playSoundOnce}
      >
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

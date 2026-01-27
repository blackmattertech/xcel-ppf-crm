'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface FollowUp {
  id: string
  scheduled_at: string
  notes: string | null
  lead: {
    id: string
    name: string
    phone: string
  } | null
}

interface FollowUpNotifications {
  overdue: FollowUp[]
  upcoming: FollowUp[]
  totalPending: number
}

export default function PopupNotification() {
  const [notifications, setNotifications] = useState<FollowUpNotifications | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function checkUserRole() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return

    const { data: userData } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()

    if (userData) {
      const userDataTyped = userData as any
      const roleName = Array.isArray(userDataTyped.roles) 
        ? userDataTyped.roles[0]?.name 
        : userDataTyped.roles?.name
      setUserRole(roleName)
    }
  }

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/followups/notifications')
      if (response.ok) {
        const data = await response.json()
        
        // Only show popup if there are new overdue follow-ups
        const hasOverdue = (data.overdue?.length || 0) > 0
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
              body: `You have ${data.overdue.length} overdue follow-up${data.overdue.length > 1 ? 's' : ''} that need attention.`,
              icon: '/favicon.ico',
              tag: 'followup-notification',
            })
          }
        }
        
        setNotifications(data)
      }
    } catch (error) {
      console.error('Failed to fetch follow-up notifications:', error)
    }
  }, [lastNotificationTime])

  useEffect(() => {
    checkUserRole()
  }, [])

  useEffect(() => {
    if (userRole === 'tele_caller') {
      fetchNotifications()
      // Check for new notifications every 2 minutes
      const interval = setInterval(() => {
        fetchNotifications()
      }, 2 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userRole, fetchNotifications])

  // Play notification sound when popup shows
  useEffect(() => {
    if (showPopup && notifications && notifications.overdue.length > 0) {
      try {
        // Create audio element with your custom notification sound
        // Place your audio file in the public folder (e.g., public/notification.wav)
        // Supported formats: .mp3, .wav, .ogg
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

  // Only show for tele-callers with overdue follow-ups
  if (userRole !== 'tele_caller' || !showPopup || !notifications || notifications.overdue.length === 0) {
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

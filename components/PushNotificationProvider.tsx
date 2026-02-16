'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuthContext } from './AuthProvider'
import {
  isFirebaseConfigured,
  isFirebaseMessagingSupported,
  getPushUnavailableReason,
  getFCMTokenWhenGranted,
  getFirebaseMessaging,
} from '@/lib/firebase'
import { onMessage } from 'firebase/messaging'

const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

type PushContextValue = {
  /** True if FCM is configured and browser supports push */
  pushSupported: boolean
  /** 'default' = not asked yet, 'granted' = enabled, 'denied' = user blocked */
  pushPermission: 'default' | 'granted' | 'denied'
  /** Call to trigger the browser permission prompt and register token (must be from user click) */
  requestEnablePush: () => Promise<void>
  /** When push is not supported, a short message explaining why; null when supported */
  pushUnavailableReason: string | null
}

const PushNotificationContext = createContext<PushContextValue | null>(null)

export function usePushNotification() {
  return useContext(PushNotificationContext)
}

/**
 * Registers FCM token with the backend when user enables notifications (button click).
 * Shows an in-app "Enable notifications" banner so the browser permission prompt is triggered by a user gesture (required by many browsers).
 */
export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, userId } = useAuthContext()
  const registeredTokenRef = useRef<string | null>(null)
  const [permissionDismissed, setPermissionDismissed] = useState(false)
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission as 'default' | 'granted' | 'denied'
    }
    return 'default'
  })
  const [enabling, setEnabling] = useState(false)
  const showPermissionBanner = Boolean(
    isAuthenticated &&
    userId &&
    isFirebaseConfigured() &&
    isFirebaseMessagingSupported() &&
    permissionState === 'default' &&
    !permissionDismissed
  )
  // Registers token in background (keeps function above effects to avoid hoisting lint errors)
  async function registerTokenInBackground(providedToken?: string | null, retryCount = 0) {
    const token = providedToken ?? (await getFCMTokenWhenGranted())
    if (!token) {
      if (isDev) console.warn('[Push] No FCM token to register. Check browser console for FCM getToken errors, and that you are on https:// or localhost.')
      return
    }
    if (registeredTokenRef.current === token) return
    try {
      const res = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fcm_token: token,
          device_label: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
        credentials: 'include',
      })
      if (res.ok) {
        registeredTokenRef.current = token
        if (isDev) console.log('[Push] FCM token registered successfully.')
      } else {
        const text = await res.text()
        if (isDev) console.error(`[Push] Register failed ${res.status}:`, text || res.statusText)
        if (retryCount < 1) setTimeout(() => registerTokenInBackground(undefined, retryCount + 1), 2000)
      }
    } catch (e) {
      if (isDev) console.error('[Push] Failed to register push token:', e)
      if (retryCount < 1) setTimeout(() => registerTokenInBackground(undefined, retryCount + 1), 2000)
    }
  }

  // When already granted, register token automatically. When default, show banner so user can click to enable.
  // Skip if browser doesn't support FCM (e.g. in-app browsers, non-HTTPS, no service workers) to avoid messaging/unsupported-browser.
  useEffect(() => {
    if (!isAuthenticated || !userId || !isFirebaseConfigured() || typeof window === 'undefined') return
    if (!('Notification' in window)) return

    const supported = isFirebaseMessagingSupported()
    if (!supported) return
    if (permissionState === 'granted') {
      void registerTokenInBackground()
      return
    }
  }, [isAuthenticated, userId, permissionDismissed, permissionState, registerTokenInBackground])

  async function handleEnableNotifications() {
    if (!isAuthenticated || !userId || !isFirebaseConfigured() || !isFirebaseMessagingSupported()) {
      if (isDev) console.warn('[Push] Enable skipped: auth or Firebase not ready.')
      return
    }
    setEnabling(true)
    setPermissionDismissed(true)
    // Request permission synchronously in the same turn as the click (no await before this).
    // Browsers require this to be inside a "short-running user-generated event handler".
    const permissionPromise = Notification.requestPermission()
    const permission = await permissionPromise
    setEnabling(false)
    setPermissionState(permission as 'default' | 'granted' | 'denied')
    if (permission !== 'granted') {
      if (permission === 'default') setPermissionDismissed(false)
      return
    }
    const token = await getFCMTokenWhenGranted()
    if (token) {
      await registerTokenInBackground(token)
    } else {
      if (isDev) console.warn('[Push] No token after permission granted. If you see "insecure", use https:// or http://localhost (not http://192.168.x.x).')
      setPermissionDismissed(false)
    }
  }

  function dismissBanner() {
    setPermissionDismissed(true)
  }

  // Foreground message handler: show browser Notification if permitted
  useEffect(() => {
    if (!isAuthenticated || !isFirebaseConfigured() || !isFirebaseMessagingSupported()) return

    const messaging = getFirebaseMessaging()
    if (!messaging) return

    const unsubscribe = onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? payload.data?.title ?? 'Xcel CRM'
      const body = payload.notification?.body ?? payload.data?.body ?? ''
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(title, {
          body,
          icon: '/icon-192x192.png',
          tag: payload.data?.type ?? 'fcm',
          data: payload.data,
        })
        n.onclick = () => {
          window.focus()
          const url = payload.data?.click_action ?? payload.data?.url
          if (url) {
            window.location.href = url.startsWith('http') ? url : window.location.origin + (url.startsWith('/') ? url : '/' + url)
          }
          n.close()
        }
      }
    })

    return () => unsubscribe()
  }, [isAuthenticated])

  const pushContextValue: PushContextValue = {
    pushSupported: isAuthenticated && isFirebaseConfigured() && isFirebaseMessagingSupported(),
    pushPermission: permissionState,
    requestEnablePush: handleEnableNotifications,
    pushUnavailableReason: isAuthenticated ? getPushUnavailableReason() : null,
  }

  return (
    <PushNotificationContext.Provider value={pushContextValue}>
      {children}
      {/* In-app banner: enables permission request on button click (user gesture required by many browsers) */}
      {showPermissionBanner && isFirebaseConfigured() && isFirebaseMessagingSupported() && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 rounded-lg shadow-lg bg-gray-900 text-white p-4 flex flex-col gap-3">
          <p className="text-sm font-medium">
            Get follow-up alerts on this device
          </p>
          <p className="text-xs text-gray-300">
            Allow notifications to receive push when follow-ups are assigned to you.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={enabling}
              className="flex-1 px-3 py-2 rounded-md bg-white text-gray-900 text-sm font-medium hover:bg-gray-100 disabled:opacity-60"
            >
              {enabling ? 'Enabling…' : 'Enable notifications'}
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="px-3 py-2 rounded-md text-gray-300 hover:text-white text-sm"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </PushNotificationContext.Provider>
  )
}

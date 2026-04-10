/**
 * Client-side Firebase app and FCM messaging.
 * Only used in the browser when push notification env vars are set.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function isFirebaseConfigured(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  )
}

/** HTTPS or localhost only — required for FCM; stricter than isSecureContext alone in some Firefox/PWA cases. */
export function isPushSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  const { protocol, hostname } = window.location
  if (protocol === 'https:') return true
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

let app: FirebaseApp | null = null
let messaging: Messaging | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null
  if (app) return app
  const existing = getApps()
  if (existing.length) {
    app = existing[0] as FirebaseApp
    return app
  }
  app = initializeApp(firebaseConfig)
  return app
}

/**
 * True if the browser supports FCM (secure context, service workers, push).
 * When false, avoid calling getMessaging() or getToken() to prevent messaging/unsupported-browser errors.
 */
export function isFirebaseMessagingSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (!isPushSecureContext()) return false
  if (!('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  try {
    const app = getFirebaseApp()
    if (!app) return false
    const m = getFirebaseMessaging()
    return m !== null
  } catch {
    return false
  }
}

/**
 * Returns a short reason why push is unavailable, or null if push is supported.
 * Use this to show a message when the user tries to enable notifications but they can't.
 */
export function getPushUnavailableReason(): string | null {
  if (typeof window === 'undefined') return null
  if (!isFirebaseConfigured()) {
    return 'Push notifications are not configured. Add Firebase env vars (NEXT_PUBLIC_FIREBASE_* and NEXT_PUBLIC_FIREBASE_VAPID_KEY) to .env.local. See FIREBASE_PUSH_SETUP.md.'
  }
  if (!isPushSecureContext()) {
    return 'Notifications require HTTPS (or localhost). Open the CRM at https://… — not http:// on a LAN IP.'
  }
  if (!('Notification' in window)) return 'This browser does not support notifications.'
  if (!('serviceWorker' in navigator)) return 'This browser or context does not support service workers (needed for push).'
  if (!('PushManager' in window)) return 'This browser does not support push notifications.'
  try {
    const app = getFirebaseApp()
    if (!app) return 'Firebase could not be initialized. Check your Firebase config.'
    getFirebaseMessaging()
    return null
  } catch {
    return 'Push messaging is not supported in this environment (e.g. some in-app browsers). Try in Chrome or Safari over HTTPS.'
  }
}

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  try {
    if (!messaging) {
      messaging = getMessaging(firebaseApp)
    }
    return messaging
  } catch {
    return null
  }
}

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? ''

/**
 * Get FCM token when permission is already granted. Does NOT call requestPermission().
 * Use this after the user has already allowed notifications (e.g. from a click handler that called requestPermission() first).
 */
let fcmGetTokenWarned = false

export async function getFCMTokenWhenGranted(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!vapidKey || !isFirebaseConfigured()) return null
  if (!isFirebaseMessagingSupported()) return null
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return null

  const messagingInstance = getFirebaseMessaging()
  if (!messagingInstance) return null

  try {
    const token = await getToken(messagingInstance, {
      vapidKey,
      serviceWorkerRegistration: await getOrRegisterServiceWorker(),
    })
    return token
  } catch (err) {
    // Log the real failure once (often SW / browser policy, not "wrong URL" when already on https).
    if (!fcmGetTokenWarned) {
      fcmGetTokenWarned = true
      console.warn(
        '[Push] FCM getToken failed — push may be unavailable in this browser/profile. Details:',
        err
      )
    }
    return null
  }
}

/**
 * Request notification permission and get FCM token.
 * IMPORTANT: Only call this from a direct, synchronous user gesture (e.g. button click).
 * Do not call after any await – request permission first, then await.
 */
export async function getFCMToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!vapidKey || !isFirebaseConfigured()) return null
  if (!isFirebaseMessagingSupported()) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  return getFCMTokenWhenGranted()
}

const FCM_SW_URL = '/api/push/sw'

/** Return the registration for the FCM SW script so the push subscription is tied to it (not next-pwa's workbox SW). */
async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  const all = await navigator.serviceWorker.getRegistrations()
  const origin = typeof location !== 'undefined' ? location.origin : ''
  const fcmScriptFull = origin + FCM_SW_URL
  const existing = all.find((reg) => {
    const sw = reg.active ?? reg.installing ?? reg.waiting
    return sw && (sw.scriptURL === fcmScriptFull || sw.scriptURL.endsWith(FCM_SW_URL))
  })
  if (existing) return existing
  return navigator.serviceWorker.register(FCM_SW_URL, { scope: '/' })
}

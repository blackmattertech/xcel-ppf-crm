import admin from 'firebase-admin'
import { getPushTokensByUserId } from './push-token.service'

let messaging: admin.messaging.Messaging | null = null

function getMessaging(): admin.messaging.Messaging {
  if (!messaging) {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!credential) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is not set. Use a JSON string of your Firebase service account key.'
      )
    }
    try {
      const serviceAccount = JSON.parse(credential) as admin.ServiceAccount
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
      }
      messaging = admin.messaging()
    } catch (e) {
      throw new Error(
        `Invalid FIREBASE_SERVICE_ACCOUNT: ${e instanceof Error ? e.message : 'Invalid JSON'}`
      )
    }
  }
  return messaging
}

export type PushPayload = {
  title: string
  body: string
  /** Optional URL path to open when notification is clicked (e.g. /followups, /leads/123) */
  clickAction?: string
  /** Optional key-value data for the client */
  data?: Record<string, string>
}

const isDev = process.env.NODE_ENV === 'development'

/**
 * Send push notification to all devices registered for a user.
 * No-op if FCM is not configured or user has no tokens.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ success: number; failure: number }> {
  const tokens = await getPushTokensByUserId(userId)
  if (tokens.length === 0) {
    if (isDev) console.log('[Push] Skipped: no FCM tokens for user', userId)
    return { success: 0, failure: 0 }
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    if (isDev) console.log('[Push] Skipped: FIREBASE_SERVICE_ACCOUNT not set. Add service account JSON to .env.local')
    return { success: 0, failure: 0 }
  }

  const multicastMessage: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      ...payload.data,
      ...(payload.clickAction ? { click_action: payload.clickAction } : {}),
    },
    webpush: {
      fcmOptions: payload.clickAction
        ? { link: payload.clickAction.startsWith('http') ? payload.clickAction : undefined }
        : undefined,
    },
  }

  const messagingInstance = getMessaging()
  const result = await messagingInstance.sendEachForMulticast(multicastMessage)
  if (isDev) console.log('[Push] Sent:', result.successCount, 'ok,', result.failureCount, 'failed, for user', userId)

  return {
    success: result.successCount,
    failure: result.failureCount,
  }
}

/**
 * Send a follow-up reminder push to the assigned user.
 */
export async function sendFollowUpAssignedNotification(
  userId: string,
  options: {
    leadName?: string
    scheduledAt: string
    followUpId: string
    leadId: string
  }
): Promise<{ success: number; failure: number }> {
  const scheduled = new Date(options.scheduledAt).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const title = 'New follow-up assigned'
  const body = options.leadName
    ? `Follow-up for ${options.leadName} scheduled for ${scheduled}`
    : `Follow-up scheduled for ${scheduled}`

  return sendPushToUser(userId, {
    title,
    body,
    clickAction: `/leads/${options.leadId}`,
    data: {
      type: 'follow_up_assigned',
      followUpId: options.followUpId,
      leadId: options.leadId,
    },
  })
}

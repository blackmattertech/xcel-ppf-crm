import { logSMSActivity } from '../activity.service'

export interface SMSOptions {
  to: string
  message: string
  from?: string
}

export interface SMSResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send SMS (stub - requires SMS gateway integration)
 * TODO: Integrate with SMS provider (Twilio, AWS SNS, etc.)
 */
export async function sendSMS(options: SMSOptions): Promise<SMSResult> {
  // Stub implementation
  // In production, this would integrate with:
  // - Twilio
  // - AWS SNS
  // - MessageBird
  // - Other SMS gateways

  console.log('SMS send requested:', {
    to: options.to,
    messageLength: options.message.length,
  })

  // For now, return success (stub)
  // TODO: Implement actual SMS sending
  return {
    success: true,
    messageId: `stub-sms-${Date.now()}`,
  }
}

/**
 * Send SMS and log activity
 */
export async function sendSMSToLead(
  leadId: string,
  options: SMSOptions,
  performedBy?: string
): Promise<SMSResult> {
  const result = await sendSMS(options)

  if (result.success) {
    // Log SMS activity
    try {
      await logSMSActivity(leadId, 'sent', options.message, performedBy, {
        to: options.to,
        messageId: result.messageId,
      })
    } catch (error) {
      console.error('Failed to log SMS activity:', error)
    }
  }

  return result
}

/**
 * Track SMS delivery status (webhook handler)
 */
export async function trackSMSEvent(
  messageId: string,
  event: 'sent' | 'delivered' | 'failed',
  metadata?: Record<string, any>
): Promise<void> {
  // TODO: Update SMS tracking in database
  console.log('SMS event tracked:', { messageId, event, metadata })
}

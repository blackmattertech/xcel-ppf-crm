import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const {
      apiKey,
      apiSecret,
      senderEmail,
      recipient,
      subject,
      message,
    }: {
      apiKey?: string
      apiSecret?: string
      senderEmail?: string
      recipient?: string
      subject?: string
      message?: string
    } = body

    if (!apiKey || !apiSecret || !senderEmail || !recipient) {
      return NextResponse.json(
        { error: 'Missing required fields (apiKey, apiSecret, senderEmail, recipient).' },
        { status: 400 }
      )
    }

    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`

    const mailjetResponse = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: senderEmail,
            },
            To: [
              {
                Email: recipient,
              },
            ],
            Subject: subject || 'Test email from Xcel PPF CRM',
            TextPart: message || 'This is a test email sent via Mailjet from Xcel PPF CRM.',
          },
        ],
      }),
    })

    if (!mailjetResponse.ok) {
      const errorText = await mailjetResponse.text()
      console.error('Mailjet API error:', errorText)
      return NextResponse.json(
        { error: 'Failed to send email via Mailjet. Please verify your credentials and sender.' },
        { status: 502 }
      )
    }

    const data = await mailjetResponse.json()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Mailjet test-send error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while sending email via Mailjet.' },
      { status: 500 }
    )
  }
}


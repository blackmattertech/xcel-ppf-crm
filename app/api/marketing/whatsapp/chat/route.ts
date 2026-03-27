import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import {
  assignConversation,
  deleteConversationsByKeys,
  deleteMessagesByIds,
  getConversation,
  getWhatsappInboxRevision,
  getWhatsappThreadRevision,
  listConversations,
  listMessagesByConversationKey,
  markConversationRead,
  toInboxMessageDTO,
} from '@/backend/services/whatsapp-chat.service'
import { getResolvedWhatsAppConfig } from '@/backend/services/whatsapp-config.service'

/** Strip weak prefix and quotes for If-None-Match comparison. */
function normalizeIfNoneMatch(v: string | null): string | null {
  if (!v) return null
  const s = v.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return s || null
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const mode = request.nextUrl.searchParams.get('mode')
  if (mode === 'conversations') {
    const search = request.nextUrl.searchParams.get('search') ?? ''
    const assignedTo = request.nextUrl.searchParams.get('assignedTo') || undefined
    const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'
    const hasListFilters = !!(search.trim() || assignedTo || unreadOnly)

    if (!hasListFilters) {
      const revision = await getWhatsappInboxRevision()
      if (revision) {
        const etag = `"${revision}"`
        const inm = normalizeIfNoneMatch(request.headers.get('if-none-match'))
        if (inm && inm === revision) {
          return new NextResponse(null, { status: 304, headers: { ETag: etag } })
        }
        const conversations = await listConversations({ search, assignedTo, unreadOnly })
        const res = NextResponse.json({ conversations })
        res.headers.set('ETag', etag)
        return res
      }
    }

    const conversations = await listConversations({ search, assignedTo, unreadOnly })
    return NextResponse.json({ conversations })
  }

  const conversationKey = request.nextUrl.searchParams.get('conversationKey')
  if (conversationKey) {
    const revision = await getWhatsappThreadRevision({ conversationKey })
    if (revision) {
      const etag = `"${revision}"`
      const inm = normalizeIfNoneMatch(request.headers.get('if-none-match'))
      if (inm && inm === revision) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } })
      }
      const messages = await listMessagesByConversationKey(conversationKey)
      const res = NextResponse.json({ messages })
      res.headers.set('ETag', etag)
      return res
    }
    const messages = await listMessagesByConversationKey(conversationKey)
    return NextResponse.json({ messages })
  }

  const leadId = request.nextUrl.searchParams.get('leadId')
  const phone = request.nextUrl.searchParams.get('phone')
  if (!leadId && !phone) {
    return NextResponse.json(
      { error: 'Provide leadId or phone' },
      { status: 400 }
    )
  }

  const revision = await getWhatsappThreadRevision({ conversationKey: null, leadId, phone })
  if (revision) {
    const etag = `"${revision}"`
    const inm = normalizeIfNoneMatch(request.headers.get('if-none-match'))
    if (inm && inm === revision) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } })
    }
    const messages = await getConversation(leadId || null, phone || '')
    const res = NextResponse.json({ messages: messages.map(toInboxMessageDTO) })
    res.headers.set('ETag', etag)
    return res
  }

  const messages = await getConversation(leadId || null, phone || '')
  return NextResponse.json({ messages: messages.map(toInboxMessageDTO) })
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const body = await request.json().catch(() => null) as
    | { action?: 'mark_read' | 'assign'; conversationKey?: string; assignedTo?: string | null }
    | null
  if (!body?.action || !body.conversationKey) {
    return NextResponse.json({ error: 'action and conversationKey are required' }, { status: 400 })
  }

  if (body.action === 'mark_read') {
    const { config } = await getResolvedWhatsAppConfig(user.id)
    await markConversationRead(body.conversationKey, config)
    return NextResponse.json({ success: true })
  }
  if (body.action === 'assign') {
    if (process.env.INBOX_ASSIGNMENT_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Assignment is disabled by feature flag' }, { status: 403 })
    }
    await assignConversation(body.conversationKey, body.assignedTo ?? null)
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}

const MAX_BULK_DELETE_KEYS = 50
const MAX_MESSAGE_IDS_DELETE = 100

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const body = (await request.json().catch(() => null)) as {
    conversationKeys?: unknown
    messageIds?: unknown
  } | null

  if (Array.isArray(body?.messageIds) && body.messageIds.length > 0) {
    const ids = body.messageIds.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
    if (ids.length === 0) {
      return NextResponse.json({ error: 'messageIds must contain valid UUID strings' }, { status: 400 })
    }
    if (ids.length > MAX_MESSAGE_IDS_DELETE) {
      return NextResponse.json(
        { error: `At most ${MAX_MESSAGE_IDS_DELETE} messages per request` },
        { status: 400 }
      )
    }
    try {
      const { deletedMessageCount } = await deleteMessagesByIds(ids)
      return NextResponse.json({ success: true, deletedMessageCount })
    } catch (e) {
      console.error('[whatsapp chat] DELETE messages:', e)
      return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 })
    }
  }

  const keys = body?.conversationKeys
  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json(
      { error: 'Provide conversationKeys or messageIds' },
      { status: 400 }
    )
  }
  const asStrings = keys.filter((k): k is string => typeof k === 'string')
  if (asStrings.length !== keys.length) {
    return NextResponse.json({ error: 'conversationKeys must be strings' }, { status: 400 })
  }
  if (asStrings.length > MAX_BULK_DELETE_KEYS) {
    return NextResponse.json(
      { error: `At most ${MAX_BULK_DELETE_KEYS} conversations per request` },
      { status: 400 }
    )
  }

  try {
    const { deletedMessageCount } = await deleteConversationsByKeys(asStrings)
    return NextResponse.json({ success: true, deletedMessageCount })
  } catch (e) {
    console.error('[whatsapp chat] DELETE conversations:', e)
    return NextResponse.json({ error: 'Failed to delete conversations' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getLandingPageSettings } from '@/backend/services/landing-page.service'

/**
 * Public read of landing page copy/media URLs (no auth).
 */
export async function GET() {
  try {
    const settings = await getLandingPageSettings()
    if (!settings) {
      return NextResponse.json({ error: 'Landing page is not configured' }, { status: 404 })
    }
    return NextResponse.json({ settings })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load landing page' },
      { status: 500 }
    )
  }
}

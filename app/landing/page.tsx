import type { Metadata } from 'next'
import { getLandingPageSettings } from '@/backend/services/landing-page.service'
import PublicLandingClient from './PublicLandingClient'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getLandingPageSettings()
  const title = settings?.hero_title?.trim() || 'Xcel'
  return {
    title: `${title.slice(0, 70)}`,
    description: settings?.hero_subtitle?.slice(0, 160) || 'Contact us',
  }
}

export default async function LandingPage() {
  const settings = await getLandingPageSettings()
  if (!settings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-zinc-950 px-4 text-center text-zinc-300">
        <p className="text-lg">Landing page is not configured yet.</p>
        <p className="text-sm text-zinc-500">Run the database migration and save content from Marketing → Landing page.</p>
      </div>
    )
  }
  return <PublicLandingClient settings={settings} />
}

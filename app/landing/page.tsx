import { notFound } from 'next/navigation'

/**
 * Landing entry is disabled in the UI; direct /landing requests 404.
 * Add a real page body here when you want to ship a public landing — remove notFound() then.
 */
export default function LandingPage() {
  notFound()
}

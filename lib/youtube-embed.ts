/**
 * Convert common YouTube watch/share URLs to an embed URL, or return null if not YouTube.
 */
export function getYoutubeEmbedSrc(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        return `https://www.youtube-nocookie.com${u.pathname}${u.search}`
      }
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`
      const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/)
      if (shorts?.[1]) {
        return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(shorts[1])}`
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
    }
  } catch {
    return null
  }
  return null
}

export function isLikelyDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url.trim())
}

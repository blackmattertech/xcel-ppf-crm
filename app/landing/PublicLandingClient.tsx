'use client'

import { useMemo, useState, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Database } from '@/shared/types/database'
import { parseLandingFormFields, type LandingFormField } from '@/shared/types/landing-form'
import { getYoutubeEmbedSrc, isLikelyDirectVideoUrl } from '@/lib/youtube-embed'

type LandingPageSettings = Database['public']['Tables']['landing_page_settings']['Row']

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40'

function useLandingUtmParams() {
  const searchParams = useSearchParams()
  return useMemo(
    () => ({
      utm_source: searchParams.get('utm_source') ?? undefined,
      utm_medium: searchParams.get('utm_medium') ?? undefined,
      utm_campaign: searchParams.get('utm_campaign') ?? undefined,
      utm_content: searchParams.get('utm_content') ?? undefined,
      utm_term: searchParams.get('utm_term') ?? undefined,
    }),
    [searchParams]
  )
}

function LandingForm({
  settings,
  utm,
  fieldDefs,
}: {
  settings: LandingPageSettings
  utm: ReturnType<typeof useLandingUtmParams>
  fieldDefs: LandingFormField[]
}) {
  const sorted = useMemo(() => [...fieldDefs].sort((a, b) => a.order - b.order), [fieldDefs])
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of sorted) init[f.id] = ''
    return init
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const setVal = useCallback((id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }))
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      const fields: Record<string, unknown> = {}
      for (const f of sorted) {
        fields[f.id] = values[f.id] ?? ''
      }
      const res = await fetch('/api/public/landing-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, ...utm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(typeof data.error === 'string' ? data.error : 'Something went wrong.')
        setStatus('error')
        return
      }
      setStatus('done')
      const cleared: Record<string, string> = {}
      for (const f of sorted) cleared[f.id] = ''
      setValues(cleared)
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div
        className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-lg text-zinc-200"
        role="status"
      >
        {settings.form_success_message}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-xl backdrop-blur-md md:p-8">
      <h2 className="text-xl font-semibold text-white md:text-2xl">{settings.form_section_title}</h2>
      <div className="mt-6 space-y-4">
        {sorted.map((f) => (
          <div key={f.id}>
            <label htmlFor={`lp-${f.id}`} className="mb-1 block text-sm text-zinc-400">
              {f.label}
              {f.required ? <span className="text-amber-400"> *</span> : null}
            </label>
            {f.mapsTo === 'interest_level' ? (
              <select
                id={`lp-${f.id}`}
                name={f.id}
                required={f.required}
                className={inputClass}
                value={values[f.id] ?? ''}
                onChange={(e) => setVal(f.id, e.target.value)}
              >
                <option value="">{f.placeholder || 'Select…'}</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                id={`lp-${f.id}`}
                name={f.id}
                required={f.required}
                rows={4}
                placeholder={f.placeholder}
                className={`${inputClass} resize-y`}
                value={values[f.id] ?? ''}
                onChange={(e) => setVal(f.id, e.target.value)}
              />
            ) : f.type === 'select' && f.options?.length ? (
              <select
                id={`lp-${f.id}`}
                name={f.id}
                required={f.required}
                className={inputClass}
                value={values[f.id] ?? ''}
                onChange={(e) => setVal(f.id, e.target.value)}
              >
                <option value="">Select…</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`lp-${f.id}`}
                name={f.id}
                type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                required={f.required}
                autoComplete={
                  f.mapsTo === 'name' ? 'name' : f.mapsTo === 'email' ? 'email' : f.mapsTo === 'phone' ? 'tel' : undefined
                }
                placeholder={f.placeholder}
                className={inputClass}
                value={values[f.id] ?? ''}
                onChange={(e) => setVal(f.id, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      {errorMsg ? <p className="mt-4 text-sm text-red-400">{errorMsg}</p> : null}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-6 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60"
      >
        {status === 'loading' ? 'Sending…' : settings.form_button_label}
      </button>
    </form>
  )
}

function VideoBlock({ settings }: { settings: LandingPageSettings }) {
  const embed = useMemo(() => getYoutubeEmbedSrc(settings.video_url), [settings.video_url])
  const direct = useMemo(
    () => !embed && isLikelyDirectVideoUrl(settings.video_url),
    [settings.video_url, embed]
  )

  if (!settings.video_url.trim()) {
    return null
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      {settings.video_section_title ? (
        <h2 className="mb-3 text-center text-2xl font-bold text-white md:text-3xl">{settings.video_section_title}</h2>
      ) : null}
      {settings.video_description ? (
        <p className="mx-auto mb-10 max-w-2xl text-center text-zinc-400">{settings.video_description}</p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        {embed ? (
          <div className="aspect-video w-full">
            <iframe
              title={settings.video_section_title || 'Video'}
              src={embed}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : direct ? (
          <video src={settings.video_url} controls className="aspect-video w-full bg-black" playsInline />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-zinc-900 px-6 text-center text-zinc-400">
            Add a YouTube link or direct .mp4 URL in the CRM to show the video here.
          </div>
        )}
      </div>
    </section>
  )
}

function Inner({ settings }: { settings: LandingPageSettings }) {
  const utm = useLandingUtmParams()
  const fieldDefs = useMemo(() => parseLandingFormFields(settings.form_fields), [settings.form_fields])

  const heroMode = settings.hero_background ?? 'image'
  const heroImage = settings.hero_image_url?.trim()
  const heroVideo = settings.hero_video_url?.trim()
  const heroMediaOpacity = Math.min(100, Math.max(0, Number(settings.hero_background_opacity) || 40)) / 100

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="relative min-h-[480px] overflow-hidden md:min-h-[560px]">
        {heroMode === 'video' && heroVideo ? (
          <div className="absolute inset-0">
            <video
              src={heroVideo}
              className="h-full w-full object-cover"
              style={{ opacity: heroMediaOpacity }}
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/80 to-zinc-950" />
          </div>
        ) : heroMode === 'image' && heroImage ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CRM URLs */}
            <img
              src={heroImage}
              alt=""
              className="h-full w-full object-cover"
              style={{ opacity: heroMediaOpacity }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-zinc-950/85 to-zinc-950" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-zinc-950 to-zinc-950" />
        )}
        <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 md:flex-row md:items-center md:py-28">
          <div className="flex-1 space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
              {settings.hero_title || 'Welcome'}
            </h1>
            {settings.hero_subtitle ? (
              <p className="max-w-xl text-lg leading-relaxed text-zinc-300 md:text-xl">{settings.hero_subtitle}</p>
            ) : null}
          </div>
          <div className="w-full flex-1 md:max-w-md">
            <LandingForm settings={settings} utm={utm} fieldDefs={fieldDefs} />
          </div>
        </div>
      </header>

      <VideoBlock settings={settings} />

      <footer className="border-t border-white/5 py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} Xcel
      </footer>
    </div>
  )
}

export default function PublicLandingClient({ settings }: { settings: LandingPageSettings }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Loading…</div>
      }
    >
      <Inner settings={settings} />
    </Suspense>
  )
}

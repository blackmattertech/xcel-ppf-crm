'use client'

/** True if the value is a URL we can use in img src (not a Meta media handle). */
function isDisplayableMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')
}

export function TemplatePreview({
  headerFormat,
  headerText,
  headerMediaUrl,
  headerPreviewUrl,
  body,
  footer,
  buttons,
}: {
  headerFormat: string
  headerText: string
  headerMediaUrl: string
  /** Optional URL to show for header image (e.g. object URL from uploaded file). Use when headerMediaUrl is a Meta handle. */
  headerPreviewUrl?: string
  body: string
  footer: string
  buttons: Array<{ type: string; text: string; example?: string }>
}) {
  const bodyPreview = body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const samples: Record<string, string> = { '1': 'John', '2': 'Offer', '3': 'Code' }
    return samples[n] ?? `{{${n}}}`
  })
  const headerImageSrc = headerFormat === 'IMAGE' && (headerPreviewUrl ?? (isDisplayableMediaUrl(headerMediaUrl) ? headerMediaUrl : null))
  return (
    <div className="rounded-2xl bg-[#e5ddd5] p-4 max-w-sm transition-all duration-300 ease-out">
      <div className="bg-white rounded-xl shadow-md overflow-hidden text-left border border-gray-100">
        {headerFormat !== 'TEXT' && (headerMediaUrl || headerPreviewUrl || headerFormat !== 'TEXT') && (
          <div className="aspect-video bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            {headerImageSrc || (headerFormat !== 'IMAGE' && headerMediaUrl) ? (
              headerFormat === 'IMAGE' && headerImageSrc ? (
                <img src={headerImageSrc} alt="Header" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <span className="p-2">{headerFormat === 'VIDEO' ? '▶ Video' : '📄 Document'}</span>
              )
            ) : (
              <span>{headerFormat === 'IMAGE' ? '🖼 Image' : headerFormat === 'VIDEO' ? '▶ Video' : '📄 Document'}</span>
            )}
          </div>
        )}
        {headerFormat === 'TEXT' && headerText && (
          <div className="px-3 pt-3 pb-1 font-semibold text-gray-900 text-sm">{headerText}</div>
        )}
        <div className="px-3 py-2 text-gray-800 text-sm whitespace-pre-wrap transition-opacity duration-200">{bodyPreview || 'Body text…'}</div>
        {footer && <div className="px-3 pb-2 pt-0 text-gray-500 text-xs">{footer}</div>}
        {buttons.length > 0 && (
          <div className="px-2 pb-3 pt-1 flex flex-col gap-1.5">
            {buttons.map((b, i) => (
              <span
                key={i}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition transform hover:scale-[1.02] ${
                  b.type === 'URL' ? 'bg-[#25D366]' : b.type === 'PHONE_NUMBER' ? 'bg-[#128C7E]' : b.type === 'COPY_CODE' ? 'bg-[#075E54]' : b.type === 'CALL_REQUEST' ? 'bg-[#128C7E]' : b.type === 'FLOW' ? 'bg-[#075E54]' : 'bg-[#25D366]'
                }`}
              >
                {b.type === 'URL' && <span aria-hidden>🔗</span>}
                {(b.type === 'PHONE_NUMBER' || b.type === 'CALL_REQUEST') && <span aria-hidden>📞</span>}
                {b.type === 'COPY_CODE' && <span aria-hidden>📋</span>}
                {b.type === 'FLOW' && <span aria-hidden>📄</span>}
                {b.text}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mt-1.5">Live preview</p>
    </div>
  )
}

'use client'

import {
  LEAD_TEMPLATE_TOKEN_OPTIONS,
  getTemplateParameterSlotCounts,
} from '@/shared/lead-template-tokens'

export interface TemplateForVariables {
  id: string
  name: string
  body_text: string
  header_text?: string | null
  header_format?: string | null
}

interface TemplateVariableMapperProps {
  template: TemplateForVariables
  bodyParameters: string[] | null
  headerParameters: string[] | null
  onChange: (next: { body_parameters: string[] | null; header_parameters: string[] | null }) => void
}

function ParameterRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const isKnownToken = LEAD_TEMPLATE_TOKEN_OPTIONS.some((o) => o.value === value)
  const mode = isKnownToken || !value ? 'token' : 'custom'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <select
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        value={mode === 'token' ? value || '{{lead_name}}' : '__custom__'}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__custom__') onChange('')
          else onChange(v)
        }}
      >
        {LEAD_TEMPLATE_TOKEN_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="__custom__">Custom text…</option>
      </select>
      {mode === 'custom' && (
        <input
          type="text"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          placeholder="Static value for every lead"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export function TemplateVariableMapper({
  template,
  bodyParameters,
  headerParameters,
  onChange,
}: TemplateVariableMapperProps) {
  const { bodyCount, headerCount } = getTemplateParameterSlotCounts(template)

  if (bodyCount === 0 && headerCount === 0) {
    return (
      <p className="text-xs text-slate-500 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        This template has no variables — it will send as-is to every lead.
      </p>
    )
  }

  const body = [...(bodyParameters || [])]
  while (body.length < bodyCount) body.push(body.length === 0 ? '{{lead_name}}' : body.length === 1 ? '{{lead_car}}' : '')

  const header = [...(headerParameters || [])]
  while (header.length < headerCount) header.push('{{lead_name}}')

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Map each template variable to a lead field. Values auto-fill per lead when the loop sends.
      </p>
      {bodyCount > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Body variables</p>
          {Array.from({ length: bodyCount }, (_, i) => (
            <ParameterRow
              key={`body-${i}`}
              label={`{{${i + 1}}} — body`}
              value={body[i] || ''}
              onChange={(v) => {
                const next = [...body]
                next[i] = v
                onChange({
                  body_parameters: next,
                  header_parameters: headerCount > 0 ? header : null,
                })
              }}
            />
          ))}
        </div>
      )}
      {headerCount > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Header variables</p>
          {Array.from({ length: headerCount }, (_, i) => (
            <ParameterRow
              key={`header-${i}`}
              label={`{{${i + 1}}} — header`}
              value={header[i] || ''}
              onChange={(v) => {
                const next = [...header]
                next[i] = v
                onChange({
                  body_parameters: bodyCount > 0 ? body : null,
                  header_parameters: next,
                })
              }}
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Preview body: <span className="text-slate-600">{template.body_text}</span>
      </p>
    </div>
  )
}

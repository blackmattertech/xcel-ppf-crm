/**
 * Template draft: create, update, load, duplicate. Runs validation and stores errors/warnings.
 */

import type { NormalizedTemplate, TemplateDraftRow } from '@/shared/whatsapp-template-types'
import { buildCreationPayload } from './whatsapp-template-payload-builder.service'
import { validateTemplate } from './whatsapp-template-validation.service'
import * as repo from './whatsapp-template-repository.service'

export interface CreateDraftInput {
  wabaId?: string | null
  category: string
  templateSubtype: string
  name: string
  language?: string | null
  languages?: string[] | null
  parameterFormat?: string | null
  components?: unknown
  normalizedTemplate?: NormalizedTemplate
  submit_state?: string
}

export async function createDraft(input: CreateDraftInput, userId: string): Promise<TemplateDraftRow> {
  const normalized = input.normalizedTemplate ?? draftInputToNormalized(input)
  const validation = validateTemplate(normalized)
  const submitState = validation.errors.length ? 'validation_failed' : 'draft'
  const row = await repo.insertDraft({
    created_by: userId,
    updated_by: userId,
    waba_id: input.wabaId ?? null,
    category: input.category,
    template_subtype: input.templateSubtype,
    mode: 'custom',
    name: normalized.name,
    language: input.language ?? normalized.language ?? null,
    languages_json: input.languages ?? normalized.languages ?? null,
    parameter_format: input.parameterFormat ?? normalized.parameterFormat ?? null,
    components_json: input.components ?? normalized.components ?? null,
    normalized_template_json: normalized,
    validation_errors_json: validation.errors,
    validation_warnings_json: validation.warnings,
    submit_state: submitState,
  })
  if (!row) throw new Error('Failed to create draft')
  return row
}

export async function updateDraft(
  id: string,
  input: Partial<CreateDraftInput> & { normalizedTemplate?: NormalizedTemplate },
  userId: string
): Promise<TemplateDraftRow | null> {
  const existing = await repo.getDraftById(id)
  if (!existing) return null
  const normalized: NormalizedTemplate =
    input.normalizedTemplate ??
    (existing.normalized_template_json as NormalizedTemplate | null) ??
    draftInputToNormalized(input as CreateDraftInput)
  const merged: NormalizedTemplate = {
    ...(normalized ?? draftInputToNormalized(input as CreateDraftInput)),
    ...(input.name ? { name: input.name } : {}),
    ...(input.category ? { category: input.category as NormalizedTemplate['category'] } : {}),
    ...(input.templateSubtype ? { subtype: input.templateSubtype as NormalizedTemplate['subtype'] } : {}),
    ...(input.language !== undefined && input.language !== null ? { language: input.language } : {}),
    ...(input.languages ? { languages: input.languages } : {}),
    ...(input.parameterFormat ? { parameterFormat: input.parameterFormat as NormalizedTemplate['parameterFormat'] } : {}),
    ...(input.components ? { components: input.components as NormalizedTemplate['components'] } : {}),
  }
  const validation = validateTemplate(merged)
  const submitState = validation.errors.length ? 'validation_failed' : 'draft'
  const updates: Partial<Record<keyof TemplateDraftRow, unknown>> = {
    updated_by: userId,
    normalized_template_json: merged,
    validation_errors_json: validation.errors,
    validation_warnings_json: validation.warnings,
    submit_state: submitState,
  }
  if (input.wabaId !== undefined) updates.waba_id = input.wabaId
  if (input.category) updates.category = input.category
  if (input.templateSubtype) updates.template_subtype = input.templateSubtype
  if (input.name) updates.name = input.name
  if (input.language !== undefined) updates.language = input.language
  if (input.languages !== undefined) updates.languages_json = input.languages
  if (input.parameterFormat !== undefined) updates.parameter_format = input.parameterFormat
  if (input.components !== undefined) updates.components_json = input.components
  if (input.submit_state) updates.submit_state = input.submit_state
  return repo.updateDraft(id, updates)
}

export async function getDraft(id: string): Promise<TemplateDraftRow | null> {
  return repo.getDraftById(id)
}

export async function listDrafts(filters?: { createdBy?: string; submitState?: string }): Promise<TemplateDraftRow[]> {
  return repo.listDrafts(filters)
}

export async function duplicateDraft(id: string, userId: string): Promise<TemplateDraftRow | null> {
  const existing = await repo.getDraftById(id)
  if (!existing) return null
  return createDraft(
    {
      wabaId: existing.waba_id,
      category: existing.category,
      templateSubtype: existing.template_subtype,
      name: existing.name + '_copy',
      language: existing.language,
      languages: (existing.languages_json as string[] | null) ?? undefined,
      parameterFormat: existing.parameter_format,
      components: existing.components_json,
      normalizedTemplate: existing.normalized_template_json as NormalizedTemplate,
    },
    userId
  ) as Promise<TemplateDraftRow | null>
}

function draftInputToNormalized(input: CreateDraftInput): NormalizedTemplate {
  const components = (input.components ?? input.normalizedTemplate?.components ?? []) as NormalizedTemplate['components']
  return {
    wabaId: input.wabaId ?? '',
    name: input.name,
    category: input.category as NormalizedTemplate['category'],
    subtype: (input.templateSubtype as NormalizedTemplate['subtype']) ?? 'STANDARD',
    language: input.language ?? undefined,
    languages: input.languages ?? undefined,
    parameterFormat: (input.parameterFormat as NormalizedTemplate['parameterFormat']) ?? null,
    components,
  }
}

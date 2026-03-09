-- Add sub_category for Meta template API (ORDER_DETAILS, ORDER_STATUS, RICH_ORDER_STATUS for UTILITY)
alter table public.whatsapp_templates
  add column if not exists sub_category text;

comment on column public.whatsapp_templates.sub_category is 'Meta sub-category for UTILITY templates: ORDER_DETAILS, ORDER_STATUS, RICH_ORDER_STATUS. Null for standard templates.';

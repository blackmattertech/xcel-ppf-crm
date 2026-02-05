# Source Icons

This folder contains icons for different lead sources/platforms.

## Required Icons:

- `ig.png` - Instagram icon (for platform: "ig" or "instagram")
- `fb.png` - Facebook icon (for platform: "fb" or "facebook")
- `whatsapp.png` - WhatsApp icon (optional, for WhatsApp source)
- `default.png` - Default icon (optional, fallback)

## Usage:

The icons are automatically used based on the `platform` field in the lead's `meta_data`:
- If `platform` is "ig" or "instagram" → uses `ig.png`
- If `platform` is "fb" or "facebook" → uses `fb.png`
- Otherwise, falls back to source field or default icon

## Icon Specifications:

- Recommended size: 24x24px or 48x48px
- Format: PNG with transparency
- Should be square aspect ratio

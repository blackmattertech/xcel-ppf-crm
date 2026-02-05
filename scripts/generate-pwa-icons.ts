/**
 * Generate PWA Icons with Black Background and Padding
 * 
 * This script processes the favicon.png and creates PWA icons
 * with a black background and padding for better visibility.
 */

import sharp from 'sharp'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const ICON_SIZES = [
  { size: 192, name: 'icon-192x192.png' },
  { size: 512, name: 'icon-512x512.png' },
]

const PADDING_PERCENT = 0.15 // 15% padding on each side
const BACKGROUND_COLOR = '#000000' // Black background

async function generatePWAIcon(inputPath: string, outputPath: string, size: number) {
  try {
    // Calculate padding
    const padding = Math.floor(size * PADDING_PERCENT)
    const iconSize = size - (padding * 2)

    // Create black background
    const background = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }, // Black
      },
    })

    // Resize and composite the icon
    const icon = await sharp(inputPath)
      .resize(iconSize, iconSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
      })
      .toBuffer()

    // Composite icon on black background with padding
    await background
      .composite([
        {
          input: icon,
          top: padding,
          left: padding,
        },
      ])
      .png()
      .toFile(outputPath)

    console.log(`✅ Generated ${outputPath} (${size}x${size})`)
  } catch (error) {
    console.error(`❌ Error generating ${outputPath}:`, error)
    throw error
  }
}

async function main() {
  const publicDir = join(process.cwd(), 'public')
  const inputIcon = join(publicDir, 'favicon.png')
  const outputDir = publicDir

  // Check if input file exists
  if (!existsSync(inputIcon)) {
    console.error(`❌ Input icon not found: ${inputIcon}`)
    process.exit(1)
  }

  console.log('🎨 Generating PWA icons with black background and padding...\n')

  // Generate icons for each size
  for (const { size, name } of ICON_SIZES) {
    const outputPath = join(outputDir, name)
    await generatePWAIcon(inputIcon, outputPath, size)
  }

  console.log('\n✨ PWA icons generated successfully!')
  console.log('\n📝 Next steps:')
  console.log('   1. Update manifest.json to use the new icons')
  console.log('   2. Rebuild the app: npm run build')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

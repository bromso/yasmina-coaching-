/**
 * Avatar Image Optimization Script
 *
 * Converts PNG avatar images to WebP format at optimized sizes.
 * Run with: bun run scripts/optimize-avatars.ts
 *
 * Requirements: bun add -D sharp
 */

import { readdir } from "node:fs/promises"
import { join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const AVATARS_DIR = join(__dirname, "../public/avatars")
const OUTPUT_DIR = AVATARS_DIR

// Sizes to generate (in pixels)
const SIZES = [32, 64, 96, 128]

async function optimizeAvatars() {
  console.log("Starting avatar optimization...")

  const files = await readdir(AVATARS_DIR)
  const pngFiles = files.filter((f) => f.endsWith(".png"))

  for (const file of pngFiles) {
    const inputPath = join(AVATARS_DIR, file)
    const { name } = parse(file)

    console.log(`Processing ${file}...`)

    // Generate WebP versions at each size
    for (const size of SIZES) {
      const outputPath = join(OUTPUT_DIR, `${name}-${size}.webp`)

      await sharp(inputPath)
        .resize(size, size, {
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 85 })
        .toFile(outputPath)

      console.log(`  Created ${name}-${size}.webp`)
    }

    // Also create a default WebP at original aspect ratio (max 128px)
    const outputPath = join(OUTPUT_DIR, `${name}.webp`)
    await sharp(inputPath)
      .resize(128, 128, { fit: "cover" })
      .webp({ quality: 85 })
      .toFile(outputPath)

    console.log(`  Created ${name}.webp (default)`)
  }

  console.log("\nOptimization complete!")
  console.log("\nNext steps:")
  console.log("1. Update components to use .webp images instead of .png")
  console.log("2. Use Next.js Image component with sizes prop for responsive loading")
  console.log("3. Optionally delete the original .png files to save space")
}

optimizeAvatars().catch(console.error)

/**
 * Screenshot script — Dashboard vendedor antes/después
 * Uso: node scripts/take-screenshots.mjs
 *
 * Genera 6 imágenes en docs/screenshots/:
 *   before-375.png  before-768.png  before-1440.png
 *   after-375.png   after-768.png   after-1440.png
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots')

const VIEWPORTS = [
  { label: '375',  width: 375,  height: 812  },
  { label: '768',  width: 768,  height: 1024 },
  { label: '1440', width: 1440, height: 900  },
]

async function shoot(page, htmlFile, label, width, height) {
  const filePath = path.join(screenshotsDir, htmlFile)
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const url = `file:///${filePath.replace(/\\/g, '/')}`

  await page.setViewportSize({ width, height })
  await page.goto(url, { waitUntil: 'networkidle' })
  // Small delay so Tailwind CDN styles render
  await page.waitForTimeout(1500)

  const outPath = path.join(screenshotsDir, `${label}-${width}.png`)
  await page.screenshot({ path: outPath, fullPage: true })
  console.log(`  ✅ ${path.basename(outPath)}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

console.log('\n📸 Capturando ANTES...')
for (const { label: vpLabel, width, height } of VIEWPORTS) {
  await shoot(page, 'before.html', 'before', width, height)
}

console.log('\n📸 Capturando DESPUÉS...')
for (const { label: vpLabel, width, height } of VIEWPORTS) {
  await shoot(page, 'after.html', 'after', width, height)
}

await browser.close()
console.log('\n✅ 6 screenshots listos en docs/screenshots/\n')

/**
 * Screenshot script — Dashboard vendedor Fase 3 (antes/después + modal impagos)
 * Uso: node scripts/take-screenshots.mjs
 *
 * Genera imágenes en docs/screenshots/:
 *   before-375.png  before-1440.png
 *   after-375.png   after-1440.png
 *   modal-375.png   modal-1440.png
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots')

const VIEWPORTS = [
  { label: '375',  width: 375,  height: 812  },
  { label: '1440', width: 1440, height: 900  },
]

async function shoot(page, htmlFile, label, width, height) {
  const filePath = path.join(screenshotsDir, htmlFile)
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const url = `file:///${filePath.replace(/\\/g, '/')}`

  await page.setViewportSize({ width, height })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const outPath = path.join(screenshotsDir, `${label}-${width}.png`)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`  ✅ ${path.basename(outPath)}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

console.log('\n📸 ANTES (vendedor ve 5 cards de agente — incorrecto)...')
for (const { width, height } of VIEWPORTS) {
  await shoot(page, 'before.html', 'before', width, height)
}

console.log('\n📸 DESPUÉS (vendedor ve 3 cards propias — Fase 3)...')
for (const { width, height } of VIEWPORTS) {
  await shoot(page, 'after.html', 'after', width, height)
}

console.log('\n📸 MODAL impagos (click en card Cobranza)...')
for (const { width, height } of VIEWPORTS) {
  await shoot(page, 'modal-impagos.html', 'modal', width, height)
}

await browser.close()
console.log('\n✅ Screenshots listos en docs/screenshots/\n')

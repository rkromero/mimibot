/**
 * Screenshots Fase 2 — /admin/metas con agentes + vendedores
 * Uso: node scripts/take-screenshots-fase2.mjs
 *
 * Genera en docs/screenshots/:
 *   before-admin-metas-375.png   before-admin-metas-1440.png
 *   after-admin-metas-375.png    after-admin-metas-1440.png
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

async function shoot(page, htmlFile, outLabel, width, height) {
  const filePath = path.join(screenshotsDir, htmlFile)
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const url = `file:///${filePath.replace(/\\/g, '/')}`

  await page.setViewportSize({ width, height })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const outPath = path.join(screenshotsDir, `${outLabel}-${width}.png`)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`  ✅ ${path.basename(outPath)}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

console.log('\n📸 ANTES — /admin/metas (solo agentes, 5 cols)...')
for (const { width, height } of VIEWPORTS) {
  await shoot(page, 'before-admin-metas.html', 'before-admin-metas', width, height)
}

console.log('\n📸 DESPUÉS — /admin/metas (agentes + vendedores, dual rol)...')
for (const { width, height } of VIEWPORTS) {
  await shoot(page, 'after-admin-metas.html', 'after-admin-metas', width, height)
}

await browser.close()
console.log('\n✅ Screenshots Fase 2 listos en docs/screenshots/\n')

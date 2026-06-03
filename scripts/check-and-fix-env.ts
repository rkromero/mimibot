/**
 * Checks EXPOSE_ERROR_DETAILS in .env and sets it to 0 if it's 1.
 * Run: npx tsx scripts/check-and-fix-env.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env')

let content: string
try {
  content = readFileSync(envPath, 'utf-8')
} catch {
  console.log('No .env file found — nothing to fix')
  process.exit(0)
}

const match = content.match(/^EXPOSE_ERROR_DETAILS\s*=\s*(.+)$/m)
if (!match) {
  console.log('EXPOSE_ERROR_DETAILS: NOT SET in .env — OK')
} else {
  const current = match[1]?.trim()
  console.log(`EXPOSE_ERROR_DETAILS: currently = ${current}`)
  if (current === '1' || current?.toLowerCase() === 'true') {
    const updated = content.replace(/^EXPOSE_ERROR_DETAILS\s*=\s*.+$/m, 'EXPOSE_ERROR_DETAILS=0')
    writeFileSync(envPath, updated, 'utf-8')
    console.log('→ Changed to EXPOSE_ERROR_DETAILS=0')
  } else {
    console.log(`→ Value is ${current} — no change needed`)
  }
}

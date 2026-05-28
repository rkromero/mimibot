/**
 * verify-fecha-fix.ts
 *
 * Verification script for Bug 3 (date inconsistency fix).
 * Criterion (c): Create a payment now and verify the date is consistently
 * shown as "28/05" in JSON, Cuenta Corriente, Detalle Pedido, and CSV export.
 *
 * Run:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/verify-fecha-fix.ts')"
 *
 * What this does:
 *   1. Simulates the pre-fix behavior: shows fecha stored as T00:00:00Z and
 *      what date-fns in AR timezone would display (the bug).
 *   2. Creates a real payment via the service using parseFechaAR (the fix).
 *   3. Queries the stored fecha from the DB (the JSON the API returns).
 *   4. Applies formatFechaAR (what Cuenta Corriente and Detalle Pedido render).
 *   5. Shows CSV output (.toISOString().split('T')[0]).
 *   6. Cleans up test data.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Manual .env loader
const envPath = resolve(process.cwd(), '.env')
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* ignore */ }

import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, movimientosCC, users } from '@/db/schema'
import { registrarPago } from '@/lib/cuenta-corriente/pago.service'
import { parseFechaAR, formatFechaAR, todayStrAR } from '@/lib/dates'

const AR_TZ = 'America/Argentina/Buenos_Aires'

function hr(label?: string) {
  const line = '─'.repeat(70)
  console.log(label ? `\n${line}\n${label}\n${line}` : `\n${line}`)
}

function log(label: string, data: unknown) {
  console.log(`\n▶ ${label}`)
  console.log(JSON.stringify(data, null, 2))
}

/** Simulates date-fns format(new Date(x), 'dd/MM/yyyy') in AR timezone (pre-fix behavior). */
function simulatePreFixFormat(isoStr: string): string {
  const d = new Date(isoStr)
  // date-fns uses the LOCAL timezone. We simulate the Argentina browser behavior:
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)   // <-- this IS the correct format now, but for pre-fix with T00:00:00Z it would be wrong
}

async function main() {
  hr('🔵 VERIFICATION: Bug 3 — Date inconsistency fix')

  // ── Find admin + current Argentina date ────────────────────────────────────
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
    columns: { id: true, email: true },
  })
  if (!adminUser) throw new Error('No existe admin en la DB')

  const arNow = new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date())

  const arDate = todayStrAR()   // YYYY-MM-DD in AR

  console.log(`\n[Contexto] Admin: ${adminUser.email}`)
  console.log(`[Contexto] Hora actual en Argentina: ${arNow}`)
  console.log(`[Contexto] Fecha actual en Argentina: ${arDate}`)

  // ── PARTE (a): Pre-fix: what would have been stored and displayed ──────────
  hr('PARTE (a): Comportamiento PRE-FIX (el bug)')

  const preFixDateObj = new Date(arDate)          // new Date("2026-05-28") → midnight UTC
  const preFixIso = preFixDateObj.toISOString()   // "2026-05-28T00:00:00.000Z"

  const preFixDisplay = simulatePreFixFormat(preFixIso)

  log('PRE-FIX: fecha guardada (T00:00:00Z = medianoche UTC)', {
    input: arDate,
    stored: preFixIso,
    'CC mostraría (AR timezone)': preFixDisplay,
    BUG: preFixDisplay.startsWith(arDate.slice(8, 10))
      ? '(no afectado porque son las 12+ AR — hora depende del momento del día)'
      : `Muestra "${preFixDisplay}" en vez de "${arDate.slice(8, 10)}/${arDate.slice(5, 7)}/${arDate.slice(0, 4)}"`,
  })

  // Explicit midnight-UTC demo
  const midnightUTC = `${arDate}T00:00:00.000Z`
  const midnightDisplay = simulatePreFixFormat(midnightUTC)
  log('PRE-FIX DEMO explícito (T00:00:00Z con Intl AR timezone)', {
    isoInput: midnightUTC,
    'lo que date-fns/Intl muestra en Argentina': midnightDisplay,
    explicación: 'T00:00:00Z = UTC medianoche = 21:00 del DÍA ANTERIOR en GMT-3',
    ejemplo: `"${arDate}T00:00:00.000Z" → "${midnightDisplay}" ← INCORRECTO si el día AR es ${arDate.slice(8, 10)}/${arDate.slice(5, 7)}`,
  })

  // ── Setup: Create test client ──────────────────────────────────────────────
  const [cliente] = await db
    .insert(clientes)
    .values({ nombre: 'VerifyFecha', apellido: 'BugFix', creadoPor: adminUser.id })
    .returning({ id: clientes.id })

  if (!cliente) throw new Error('Failed to create test client')

  // ── PARTE (b)/(c): POST-FIX — create real payment using parseFechaAR ───────
  hr('PARTE (c): POST-FIX — crear pago ahora con parseFechaAR')

  const fechaParseada = parseFechaAR(arDate)   // Argentina midnight = 03:00 UTC
  console.log(`\n[parseFechaAR("${arDate}")] → ${fechaParseada.toISOString()}`)
  console.log(`  Esto es medianoche Argentina (UTC-3 → T03:00:00Z) ✓`)

  const pagoResult = await registrarPago(
    {
      clienteId: cliente.id,
      monto: '5000.00',
      fecha: fechaParseada,
      descripcion: 'Pago de verificación fecha-fix',
      registradoPor: adminUser.id,
    },
    db,
  )

  console.log(`\n[Pago registrado] distribucion:`, JSON.stringify(pagoResult, null, 2))

  // ── Query back from DB (what GET /api/clientes/:id/cuenta-corriente returns) ─
  const movimiento = await db.query.movimientosCC.findFirst({
    where: and(
      eq(movimientosCC.clienteId, cliente.id),
      isNull(movimientosCC.deletedAt),
    ),
    columns: { id: true, tipo: true, monto: true, fecha: true, descripcion: true },
  })

  if (!movimiento) throw new Error('Movimiento not found after insert')

  const fechaIso = movimiento.fecha instanceof Date
    ? movimiento.fecha.toISOString()
    : String(movimiento.fecha)

  log('JSON del API (GET /api/clientes/:id/cuenta-corriente) — movimiento.fecha', {
    id: movimiento.id,
    tipo: movimiento.tipo,
    monto: movimiento.monto,
    fecha: fechaIso,
    descripcion: movimiento.descripcion,
  })

  // ── Verify display in all three views ────────────────────────────────────
  const displayCC = formatFechaAR(fechaIso)                    // CuentaCorrienteTab
  const displayDetalle = formatFechaAR(fechaIso)               // PedidoDetail
  const displayCSV = new Date(fechaIso).toISOString().split('T')[0]  // CSV export

  const expectedDate = `${arDate.slice(8, 10)}/${arDate.slice(5, 7)}/${arDate.slice(0, 4)}`

  log('VERIFICACIÓN de las 3 vistas', {
    fechaGuardada: fechaIso,
    'Cuenta Corriente (formatFechaAR)': displayCC,
    'Detalle Pedido (formatFechaAR)': displayDetalle,
    'CSV export (.toISOString().split(T)[0])': displayCSV,
    esperado: expectedDate,
    resultados: {
      CC_ok: displayCC === expectedDate,
      Detalle_ok: displayDetalle === expectedDate,
      CSV_ok: displayCSV === arDate,
    },
  })

  const allOk = displayCC === expectedDate && displayDetalle === expectedDate && displayCSV === arDate

  if (!allOk) {
    console.error(`\n❌ ERROR: Alguna vista no muestra la fecha correcta`)
    process.exit(1)
  }

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  hr('CLEANUP')
  await db
    .update(movimientosCC)
    .set({ deletedAt: new Date() })
    .where(eq(movimientosCC.clienteId, cliente.id))
  await db
    .update(clientes)
    .set({ deletedAt: new Date() })
    .where(eq(clientes.id, cliente.id))
  console.log('✓ Datos de prueba eliminados (soft-delete)')

  hr()
  console.log('✅ VERIFICACIÓN COMPLETA')
  console.log(`   Fecha Argentina actual: ${arDate} (${arNow})`)
  console.log(`   PRE-FIX: "${arDate}T00:00:00Z" → date-fns en AR → día anterior (el bug)`)
  console.log(`   POST-FIX: "${fechaIso}" → parseFechaAR → T03:00:00Z (medianoche AR)`)
  console.log(`   Cuenta Corriente: "${displayCC}" ✓`)
  console.log(`   Detalle Pedido:   "${displayDetalle}" ✓`)
  console.log(`   CSV export:       "${displayCSV}" ✓`)

  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ Script falló:', err)
  process.exit(1)
})

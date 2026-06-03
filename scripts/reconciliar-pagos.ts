/**
 * Reconciliación de montoPagado / saldoPendiente / estadoPago
 * contra la fuente de verdad: SUM(aplicaciones_pago.monto_aplicado).
 *
 * Uso:
 *   npx tsx scripts/reconciliar-pagos.ts            → dry-run (solo reporte)
 *   npx tsx scripts/reconciliar-pagos.ts --apply    → aplica los cambios
 */

import 'dotenv/config'
import postgres from 'postgres'

const DRY_RUN = !process.argv.includes('--apply')

const client = postgres(process.env['DATABASE_URL']!, { max: 1, idle_timeout: 10 })

type EstadoPago = 'impago' | 'parcial' | 'pagado'

function calcEstadoPago(pagadoReal: number, total: number): EstadoPago {
  if (pagadoReal <= 0) return 'impago'
  if (pagadoReal >= total) return 'pagado'
  return 'parcial'
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.005
}

async function main() {
  console.log(`\n=== Reconciliar pagos — modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : 'APPLY'} ===\n`)

  // Fetch all live pedidos with their actual sum from aplicaciones_pago
  const rows = await client<{
    id: string
    total: string
    monto_pagado: string
    saldo_pendiente: string
    estado_pago: EstadoPago
    pagado_real: string
  }[]>`
    SELECT
      p.id,
      p.total::text            AS total,
      p.monto_pagado::text     AS monto_pagado,
      p.saldo_pendiente::text  AS saldo_pendiente,
      p.estado_pago,
      COALESCE(SUM(ap.monto_aplicado), 0)::text AS pagado_real
    FROM pedidos p
    LEFT JOIN aplicaciones_pago ap
      ON ap.pedido_id = p.id AND ap.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.total, p.monto_pagado, p.saldo_pendiente, p.estado_pago
    ORDER BY p.id
  `

  const desincronizados: Array<{
    id: string
    total: number
    montoPagadoActual: number
    pagadoReal: number
    nuevoMontoPagado: number
    nuevoSaldo: number
    estadoActual: EstadoPago
    nuevoEstado: EstadoPago
  }> = []

  for (const row of rows) {
    const total = parseFloat(row.total)
    const montoPagadoActual = parseFloat(row.monto_pagado)
    const saldoActual = parseFloat(row.saldo_pendiente)
    const pagadoReal = parseFloat(row.pagado_real)

    const nuevoMontoPagado = Math.min(pagadoReal, total)
    const nuevoSaldo = Math.max(0, total - nuevoMontoPagado)
    const nuevoEstado = calcEstadoPago(nuevoMontoPagado, total)

    const montoOk = !differs(montoPagadoActual, nuevoMontoPagado)
    const saldoOk = !differs(saldoActual, nuevoSaldo)
    const estadoOk = row.estado_pago === nuevoEstado

    if (!montoOk || !saldoOk || !estadoOk) {
      desincronizados.push({
        id: row.id,
        total,
        montoPagadoActual,
        pagadoReal,
        nuevoMontoPagado,
        nuevoSaldo,
        estadoActual: row.estado_pago,
        nuevoEstado,
      })
    }
  }

  // ── Reporte ───────────────────────────────────────────────────────────────

  if (desincronizados.length === 0) {
    console.log(`✅  Todo sincronizado. ${rows.length} pedidos revisados, 0 desincronizados.\n`)
    await client.end()
    return
  }

  console.log(`⚠️  Pedidos desincronizados: ${desincronizados.length} de ${rows.length} revisados\n`)
  console.log(
    'ID'.padEnd(38) +
    'Total'.padStart(12) +
    'MontoPagado actual'.padStart(20) +
    'PagadoReal'.padStart(12) +
    'EstadoActual'.padStart(14) +
    'EstadoNuevo'.padStart(13),
  )
  console.log('─'.repeat(109))

  for (const d of desincronizados) {
    const idShort = d.id.toUpperCase().slice(0, 8)
    const montoStr = differs(d.montoPagadoActual, d.pagadoReal)
      ? `${fmt(d.montoPagadoActual)} → ${fmt(d.pagadoReal)}`
      : fmt(d.montoPagadoActual)
    const estadoStr = d.estadoActual !== d.nuevoEstado
      ? `${d.estadoActual} → ${d.nuevoEstado}`
      : d.estadoActual

    console.log(
      `  ${idShort}…`.padEnd(38) +
      fmt(d.total).padStart(12) +
      montoStr.padStart(20) +
      fmt(d.pagadoReal).padStart(12) +
      d.estadoActual.padStart(14) +
      d.nuevoEstado.padStart(13),
    )
  }

  console.log()

  if (DRY_RUN) {
    console.log(`ℹ️  DRY-RUN: no se aplicaron cambios. Usá --apply para actualizar.\n`)
    await client.end()
    return
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  console.log('Aplicando correcciones...')
  let updated = 0

  for (const d of desincronizados) {
    await client`
      UPDATE pedidos SET
        monto_pagado    = ${d.nuevoMontoPagado.toFixed(2)},
        saldo_pendiente = ${d.nuevoSaldo.toFixed(2)},
        estado_pago     = ${d.nuevoEstado},
        updated_at      = NOW()
      WHERE id = ${d.id}
    `
    updated++
    process.stdout.write(`  ✔ ${d.id.toUpperCase().slice(0, 8)}… ${d.estadoActual} → ${d.nuevoEstado}  ${fmt(d.montoPagadoActual)} → ${fmt(d.nuevoMontoPagado)}\n`)
  }

  console.log(`\n✅  ${updated} pedidos actualizados.\n`)
  await client.end()
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})

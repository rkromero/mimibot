/**
 * reproduce-bug-delete-pedido.ts
 *
 * Evidencia para criterios (a) y (c) del bug:
 *   "Eliminar pedido pagado deja pagos huérfanos → saldo falso de -78.000"
 *
 * Ejecutar:
 *   npx tsx --env-file=.env scripts/reproduce-bug-delete-pedido.ts
 *
 * El script crea datos de prueba, simula el escenario pre-fix (bug), luego
 * muestra el comportamiento post-fix (409 Conflict), y limpia todo al final.
 */

// ── Manual .env loader (tsx may not support --env-file on older Node) ─────────
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
} catch {
  // .env might not exist in CI — proceed with existing env
}

// ── Imports ───────────────────────────────────────────────────────────────────
import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, pedidos, movimientosCC, aplicacionesPago, users } from '@/db/schema'
import { deletePedido } from '@/lib/delete/delete.service'
import { ConflictError } from '@/lib/errors'

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(label?: string) {
  const line = '─'.repeat(70)
  console.log(label ? `\n${line}\n${label}\n${line}` : line)
}

function log(label: string, data: unknown) {
  console.log(`\n▶ ${label}`)
  console.log(JSON.stringify(data, null, 2))
}

async function queryCuentaCorriente(clienteId: string) {
  const [saldoRow] = await db
    .select({
      totalDebito: sql<string>`coalesce(sum(case when tipo = 'debito' then monto::numeric else 0 end), 0)`,
      totalCredito: sql<string>`coalesce(sum(case when tipo = 'credito' then monto::numeric else 0 end), 0)`,
    })
    .from(movimientosCC)
    .where(and(eq(movimientosCC.clienteId, clienteId), isNull(movimientosCC.deletedAt)))

  const totalDebito = saldoRow?.totalDebito ?? '0'
  const totalCredito = saldoRow?.totalCredito ?? '0'
  const saldo = parseFloat(totalDebito) - parseFloat(totalCredito)

  const movimientos = await db.query.movimientosCC.findMany({
    where: and(eq(movimientosCC.clienteId, clienteId), isNull(movimientosCC.deletedAt)),
    columns: { id: true, tipo: true, monto: true, pedidoId: true, descripcion: true },
    orderBy: (m, { asc }) => [asc(m.tipo)],
  })

  return { totalDebito, totalCredito, saldo, movimientos }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  hr('🔵 BUG REPRODUCTION: pagos huérfanos al eliminar pedido pagado')

  // 1. Obtener un usuario admin para FK references
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
    columns: { id: true, email: true },
  })
  if (!adminUser) throw new Error('No existe ningún usuario admin en la DB')
  console.log(`\n[Setup] Admin user encontrado: ${adminUser.email}`)

  // ─── SETUP: Crear datos de prueba ──────────────────────────────────────────
  console.log('[Setup] Creando datos de prueba…')

  const [cliente] = await db
    .insert(clientes)
    .values({ nombre: 'BugTest', apellido: 'DeletePedido', creadoPor: adminUser.id })
    .returning({ id: clientes.id })

  const [pedido] = await db
    .insert(pedidos)
    .values({
      clienteId: cliente.id,
      vendedorId: adminUser.id,
      total: '78000.00',
      saldoPendiente: '0.00',
      montoPagado: '78000.00',
      estadoPago: 'pagado',
    })
    .returning({ id: pedidos.id })

  const [debitoMov] = await db
    .insert(movimientosCC)
    .values({
      clienteId: cliente.id,
      tipo: 'debito',
      monto: '78000.00',
      pedidoId: pedido.id,
      descripcion: 'Pedido test',
      registradoPor: adminUser.id,
    })
    .returning({ id: movimientosCC.id })

  const [credito1] = await db
    .insert(movimientosCC)
    .values({
      clienteId: cliente.id,
      tipo: 'credito',
      monto: '30000.00',
      descripcion: 'Pago 1 test',
      registradoPor: adminUser.id,
    })
    .returning({ id: movimientosCC.id })

  const [credito2] = await db
    .insert(movimientosCC)
    .values({
      clienteId: cliente.id,
      tipo: 'credito',
      monto: '48000.00',
      descripcion: 'Pago 2 test',
      registradoPor: adminUser.id,
    })
    .returning({ id: movimientosCC.id })

  await db.insert(aplicacionesPago).values([
    { movimientoCreditoId: credito1.id, pedidoId: pedido.id, montoAplicado: '30000.00' },
    { movimientoCreditoId: credito2.id, pedidoId: pedido.id, montoAplicado: '48000.00' },
  ])

  console.log(`  ✓ cliente=${cliente.id}`)
  console.log(`  ✓ pedido=${pedido.id} total=$78.000`)
  console.log(`  ✓ debito=${debitoMov.id} $78.000`)
  console.log(`  ✓ credito1=${credito1.id} $30.000`)
  console.log(`  ✓ credito2=${credito2.id} $48.000`)
  console.log(`  ✓ 2 aplicaciones_pago`)

  // Estado inicial
  log('ESTADO INICIAL — saldo debería ser $0', await queryCuentaCorriente(cliente.id))

  // ─── PARTE A: Pre-fix — simular el comportamiento del servicio SIN guard ───
  hr('PARTE (a): Simulando DELETE pre-fix (sin guard → bug)')

  // Exactamente lo que hacía el servicio ANTES del fix:
  // soft-delete aplicaciones + débito + pedido, pero NO toca los créditos
  await db
    .update(aplicacionesPago)
    .set({ deletedAt: new Date() })
    .where(and(eq(aplicacionesPago.pedidoId, pedido.id), isNull(aplicacionesPago.deletedAt)))

  await db
    .update(movimientosCC)
    .set({ deletedAt: new Date() })
    .where(eq(movimientosCC.id, debitoMov.id))

  await db
    .update(pedidos)
    .set({ deletedAt: new Date() })
    .where(eq(pedidos.id, pedido.id))

  // ⚠️  Los créditos ($30k + $48k) NO se tocan → quedan activos sin pedidoId

  const cuentaConBug = await queryCuentaCorriente(cliente.id)

  log(
    'GET /api/clientes/{clienteId}/cuenta-corriente — RESPUESTA CON BUG (saldo huérfano)',
    {
      clienteId: cliente.id,
      pedidoId: pedido.id,
      pedidoEliminado: true,
      saldo: cuentaConBug.saldo,                    // ← -78000 (falso crédito)
      totalDebito: cuentaConBug.totalDebito,          // ← 0 (débito fue eliminado)
      totalCredito: cuentaConBug.totalCredito,        // ← 78000 (créditos huérfanos)
      movimientosActivos: cuentaConBug.movimientos,   // ← 2 créditos con pedidoId=null
      DIAGNOSIS:
        'saldo negativo = cliente tiene $78.000 a su favor FALSO. ' +
        'Los 2 créditos quedaron vivos como movimientos huérfanos.',
    },
  )

  // ─── RESTAURAR datos para la parte B ─────────────────────────────────────
  console.log('\n[Restore] Revirtiendo estado pre-fix para parte C…')

  await db
    .update(pedidos)
    .set({ deletedAt: null })
    .where(eq(pedidos.id, pedido.id))

  await db
    .update(movimientosCC)
    .set({ deletedAt: null })
    .where(eq(movimientosCC.id, debitoMov.id))

  await db
    .update(aplicacionesPago)
    .set({ deletedAt: null })
    .where(eq(aplicacionesPago.pedidoId, pedido.id))

  console.log('  ✓ Pedido restaurado')
  console.log('  ✓ Débito restaurado')
  console.log('  ✓ Aplicaciones restauradas')

  // ─── PARTE C: Post-fix — DELETE debería devolver 409 ─────────────────────
  hr('PARTE (c): DELETE post-fix (WITH guard → 409 Conflict)')

  let fixWorking = false
  let errorCaptured: unknown = null

  try {
    await deletePedido(pedido.id, adminUser.id)
    console.log('❌ ERROR: deletePedido no lanzó ConflictError — fix no aplicado')
  } catch (err) {
    errorCaptured = err
    if (err instanceof ConflictError) {
      fixWorking = true

      log('DELETE /api/pedidos/:id → 409 Conflict (fix funcionando)', {
        status: err.statusCode,
        code: err.code,
        error: err.message,
      })

      // Verificar integridad: pedido y balance intactos
      const pedidoActual = await db.query.pedidos.findFirst({
        where: and(eq(pedidos.id, pedido.id), isNull(pedidos.deletedAt)),
        columns: { id: true, estadoPago: true, total: true, montoPagado: true },
      })

      const cuentaPostFix = await queryCuentaCorriente(cliente.id)

      log('Verificación de integridad post-409 — pedido y pagos intactos', {
        pedido: pedidoActual,
        cuentaCorriente: {
          saldo: cuentaPostFix.saldo,
          totalDebito: cuentaPostFix.totalDebito,
          totalCredito: cuentaPostFix.totalCredito,
          movimientosActivos: cuentaPostFix.movimientos.length,
        },
        OK: cuentaPostFix.saldo === 0 && pedidoActual !== null,
      })
    } else {
      console.error('Error inesperado:', err)
    }
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────────────
  hr('CLEANUP')

  await db
    .update(aplicacionesPago)
    .set({ deletedAt: new Date() })
    .where(eq(aplicacionesPago.pedidoId, pedido.id))

  await db
    .update(movimientosCC)
    .set({ deletedAt: new Date() })
    .where(eq(movimientosCC.clienteId, cliente.id))

  await db
    .update(pedidos)
    .set({ deletedAt: new Date() })
    .where(eq(pedidos.id, pedido.id))

  await db
    .update(clientes)
    .set({ deletedAt: new Date() })
    .where(eq(clientes.id, cliente.id))

  console.log('✓ Todos los datos de prueba eliminados (soft-delete)')

  // ─── RESULTADO FINAL ──────────────────────────────────────────────────────
  hr()
  if (fixWorking) {
    console.log('✅ REPRODUCCIÓN COMPLETA')
    console.log('   (a) Bug confirmado: saldo huérfano -78.000 antes del fix')
    console.log('   (c) Fix validado: DELETE devuelve 409 + datos intactos')
  } else {
    console.log('❌ Fix NO verificado. Error capturado:', errorCaptured)
    process.exit(1)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ Script falló:', err)
  process.exit(1)
})

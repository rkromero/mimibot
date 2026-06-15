/**
 * scripts/smoke-cobertura-cartera.ts
 *
 * Smoke test automatizado para la feature "% cobertura cartera".
 *
 * Escenario:
 *   - 5 clientes asignados al vendedor
 *   - 3 pedidos confirmados (uno por cada uno de los 3 primeros clientes)
 *   - Meta con pctClientesConPedidoObjetivo = 80 %
 *   → alcanzado = 60 (3/5 = 60%), pct = 75 (60/80), estado ∈ ['en_curso','cumplida']
 *   → desasignar todos los clientes → estado = 'na', alcanzado = null, pct = null
 *
 * Corre contra DB real (DATABASE_URL). Limpia todos los datos en finally.
 * exit 0 = OK | exit 1 = FAIL
 */

import 'dotenv/config'
import { db } from '@/db'
import {
  users,
  marcas,
  productos,
  clientes,
  pedidos,
  pedidoItems,
  metas,
} from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { calcularAvanceVendedor } from '@/lib/metas/avance.service'

// ─── Guards ───────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.log('NODE_ENV=production — smoke test omitido (no correr contra DB de producción)')
  process.exit(0)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`ASSERT FAILED: ${msg}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Sin DATABASE_URL → omitir (no romper CI sin DB)
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL no disponible, smoke test omitido')
    process.exit(0)
  }

  // Test de conexión — si la DB no está disponible, salir silenciosamente
  try {
    await db.select({ id: users.id }).from(users).limit(1)
  } catch (connErr: unknown) {
    const msg = connErr instanceof Error ? connErr.message : String(connErr)
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('connect') ||
      msg.includes('placeholder') ||
      msg.includes('ENOTFOUND')
    ) {
      console.log('DATABASE_URL no disponible, smoke test omitido')
      process.exit(0)
    }
    // Error inesperado → fallar
    throw connErr
  }

  const ts = Date.now()
  const now = new Date()
  const anio = now.getFullYear()
  const mes = now.getMonth() + 1

  // Track de todos los IDs insertados para el cleanup final
  let vendedorId: string | undefined
  let productoId: string | undefined
  const clienteIds: string[] = []
  const pedidoIds: string[] = []
  let metaId: string | undefined

  let passed = false

  try {
    console.log(`\n🔬 SMOKE TEST: % Cobertura Cartera — ${anio}-${String(mes).padStart(2, '0')}`)
    console.log('─'.repeat(60))

    // ── 1. Vendedor de prueba ───────────────────────────────────────────────
    const [vendedor] = await db.insert(users).values({
      email: `smoke-vendedor-${ts}@test.local`,
      name: `Smoke Vendedor ${ts}`,
      role: 'agent',
    }).returning()

    if (!vendedor) throw new Error('No se pudo insertar el vendedor de prueba')
    vendedorId = vendedor.id
    console.log(`  ✓ Vendedor:  ${vendedorId}`)

    // ── 2. Producto de prueba ───────────────────────────────────────────────
    const [marcaDefault] = await db
      .select({ id: marcas.id })
      .from(marcas)
      .where(eq(marcas.esDefault, true))
      .limit(1)
    if (!marcaDefault) throw new Error('No hay marca por defecto configurada')

    const [producto] = await db.insert(productos).values({
      nombre: `Producto Smoke ${ts}`,
      sku: `SMOKE-${ts}`,
      precio: '100.00',
      marcaId: marcaDefault.id,
      creadoPor: vendedorId,
    }).returning()

    if (!producto) throw new Error('No se pudo insertar el producto de prueba')
    productoId = producto.id
    console.log(`  ✓ Producto:  ${productoId}`)

    // ── 3. 5 clientes asignados al vendedor ─────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const [c] = await db.insert(clientes).values({
        nombre: `SmokeCliente${i}`,
        apellido: `Test${ts}`,
        asignadoA: vendedorId,
        creadoPor: vendedorId,
      }).returning()
      if (!c) throw new Error(`No se pudo insertar cliente ${i}`)
      clienteIds.push(c.id)
    }
    console.log(`  ✓ 5 clientes insertados y asignados`)

    // ── 4. 3 pedidos confirmados (uno por los 3 primeros clientes) ──────────
    for (let i = 0; i < 3; i++) {
      const clienteId = clienteIds[i]!

      const [p] = await db.insert(pedidos).values({
        clienteId,
        vendedorId,
        estado: 'confirmado',
        fecha: now,
      }).returning()
      if (!p) throw new Error(`No se pudo insertar pedido ${i}`)
      pedidoIds.push(p.id)

      await db.insert(pedidoItems).values({
        pedidoId: p.id,
        productoId,
        cantidad: 1,
        precioUnitario: '100.00',
        subtotal: '100.00',
      })
    }
    console.log(`  ✓ 3 pedidos confirmados + items insertados`)

    // ── 5. Meta con objetivo 80% ────────────────────────────────────────────
    const [meta] = await db.insert(metas).values({
      vendedorId,
      periodoAnio: anio,
      periodoMes: mes,
      pctClientesConPedidoObjetivo: '80.00',
      creadoPor: vendedorId,
    }).returning()
    if (!meta) throw new Error('No se pudo insertar la meta')
    metaId = meta.id
    console.log(`  ✓ Meta:      ${metaId}  (objetivo 80%)`)

    // ── 6. Calcular avance — fase 1 ─────────────────────────────────────────
    console.log('\n  → calcularAvanceVendedor (fase 1: 3/5 clientes con pedido)...')
    const avance1 = await calcularAvanceVendedor(vendedorId, anio, mes)
    if (!avance1) throw new Error('calcularAvanceVendedor retornó null en fase 1')

    const pct1 = avance1.pctClientesConPedido
    console.log(`     pctClientesConPedido: ${JSON.stringify(pct1)}`)

    // ── 7. Asserts fase 1 ───────────────────────────────────────────────────
    assert(
      pct1.alcanzado === 60,
      `alcanzado esperado 60, recibido ${pct1.alcanzado}`,
    )
    assert(
      pct1.pct === 75,
      `pct esperado 75, recibido ${pct1.pct}`,
    )
    assert(
      pct1.estado === 'en_curso' || pct1.estado === 'cumplida',
      `estado esperado 'en_curso' o 'cumplida', recibido '${pct1.estado}'`,
    )
    console.log(`  ✓ Fase 1: alcanzado=60, pct=75, estado=${pct1.estado}`)

    // ── 8. Desasignar todos los clientes ────────────────────────────────────
    for (const id of clienteIds) {
      await db.update(clientes).set({ asignadoA: null }).where(eq(clientes.id, id))
    }
    console.log(`\n  → 5 clientes desasignados (asignadoA = NULL)`)

    // ── 9. Calcular avance — fase 2 ─────────────────────────────────────────
    console.log('  → calcularAvanceVendedor (fase 2: sin clientes asignados)...')
    const avance2 = await calcularAvanceVendedor(vendedorId, anio, mes)
    if (!avance2) throw new Error('calcularAvanceVendedor retornó null en fase 2')

    const pct2 = avance2.pctClientesConPedido
    console.log(`     pctClientesConPedido: ${JSON.stringify(pct2)}`)

    // ── 10. Asserts fase 2 ──────────────────────────────────────────────────
    assert(
      pct2.estado === 'na',
      `estado esperado 'na', recibido '${pct2.estado}'`,
    )
    assert(
      pct2.alcanzado === null,
      `alcanzado esperado null, recibido ${pct2.alcanzado}`,
    )
    assert(
      pct2.pct === null,
      `pct esperado null, recibido ${pct2.pct}`,
    )
    console.log(`  ✓ Fase 2: estado=na, alcanzado=null, pct=null`)

    passed = true

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ SMOKE TEST FAIL: ${msg}`)
  } finally {
    // ── Cleanup garantizado — DELETE en orden inverso a las FKs ─────────────
    console.log('\n  → Limpiando datos de prueba...')
    try {
      if (pedidoIds.length > 0) {
        await db.delete(pedidoItems).where(inArray(pedidoItems.pedidoId, pedidoIds))
        await db.delete(pedidos).where(inArray(pedidos.id, pedidoIds))
      }
      if (metaId) {
        await db.delete(metas).where(eq(metas.id, metaId))
      }
      if (clienteIds.length > 0) {
        await db.delete(clientes).where(inArray(clientes.id, clienteIds))
      }
      if (productoId) {
        await db.delete(productos).where(eq(productos.id, productoId))
      }
      if (vendedorId) {
        await db.delete(users).where(eq(users.id, vendedorId))
      }
      console.log('  ✓ Cleanup completado (0 datos de prueba persistidos)')
    } catch (cleanupErr: unknown) {
      const cleanupMsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      console.error(`  ⚠ Cleanup parcial — revisar manualmente: ${cleanupMsg}`)
    }
  }

  if (passed) {
    console.log('\n✅ SMOKE TEST OK')
    process.exit(0)
  } else {
    process.exit(1)
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`Error inesperado en smoke test: ${msg}`)
  process.exit(1)
})

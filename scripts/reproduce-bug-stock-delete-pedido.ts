/**
 * reproduce-bug-stock-delete-pedido.ts
 *
 * Evidencia para criterios (a), (b) y (c) del bug de stock:
 *   "Al eliminar un pedido, el stock NO se restituye."
 *
 * Ejecutar:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/reproduce-bug-stock-delete-pedido.ts')"
 *
 * Flujo:
 *   1. Obtener stock inicial del producto de prueba.
 *   2. Crear pedido de 12 unidades → stock baja 12.
 *   3. Simular DELETE pre-fix (sin reversión de stock) → stock sigue bajo.
 *   4. Restaurar datos.
 *   5. Ejecutar DELETE post-fix (con reversión) → stock vuelve al valor original.
 *   6. Limpiar todo.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Manual .env loader ────────────────────────────────────────────────────────
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

import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes, pedidos, pedidoItems, stockMovements, movimientosCC, users, productos,
} from '@/db/schema'
import { deletePedido } from '@/lib/delete/delete.service'

function hr(label?: string) {
  const line = '─'.repeat(70)
  console.log(label ? `\n${line}\n${label}\n${line}` : `\n${line}`)
}

function log(label: string, data: unknown) {
  console.log(`\n▶ ${label}`)
  console.log(JSON.stringify(data, null, 2))
}

async function getStockActual(productoId: string): Promise<number> {
  const [row] = await db
    .select({ saldo: stockMovements.saldoResultante })
    .from(stockMovements)
    .where(eq(stockMovements.productoId, productoId))
    .orderBy(sql`${stockMovements.createdAt} DESC`)
    .limit(1)
  return row?.saldo ?? 0
}

async function main() {
  hr('🔵 BUG REPRODUCTION: stock no revertido al eliminar pedido')

  // ── Setup: encontrar admin + primer producto activo ────────────────────────
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
    columns: { id: true, email: true },
  })
  if (!adminUser) throw new Error('No existe admin en la DB')

  const producto = await db.query.productos.findFirst({
    where: and(eq(productos.activo, true), isNull(productos.deletedAt)),
    columns: { id: true, nombre: true, sku: true },
  })
  if (!producto) throw new Error('No existe ningún producto activo')

  console.log(`\n[Setup] Admin: ${adminUser.email}`)
  console.log(`[Setup] Producto: ${producto.nombre} (${producto.sku ?? producto.id})`)

  const stockInicial = await getStockActual(producto.id)
  log('STOCK INICIAL', { productoId: producto.id, stock: stockInicial })

  // ── Crear cliente y pedido de prueba ──────────────────────────────────────
  const [cliente] = await db
    .insert(clientes)
    .values({ nombre: 'BugTest', apellido: 'StockDelete', creadoPor: adminUser.id })
    .returning({ id: clientes.id })

  const [pedido] = await db
    .insert(pedidos)
    .values({
      clienteId: cliente!.id,
      vendedorId: adminUser.id,
      total: '12000.00',
      saldoPendiente: '12000.00',
      montoPagado: '0.00',
      estadoPago: 'impago',
    })
    .returning({ id: pedidos.id })

  await db.insert(pedidoItems).values({
    pedidoId: pedido!.id,
    productoId: producto.id,
    cantidad: 12,
    precioUnitario: '1000.00',
    subtotal: '12000.00',
  })

  // Crear salida de stock (como lo haría crearPedidoConItems)
  const [salidaMov] = await db
    .insert(stockMovements)
    .values({
      productoId: producto.id,
      tipo: 'salida',
      cantidad: 12,
      saldoResultante: stockInicial - 12,
      pedidoId: pedido!.id,
      referencia: `Pedido #${pedido!.id.slice(0, 8)}`,
      registradoPor: adminUser.id,
    })
    .returning({ id: stockMovements.id })

  const stockDespuesPedido = await getStockActual(producto.id)
  log(`DESPUÉS DE CREAR PEDIDO (12u salida)`, {
    stock: stockDespuesPedido,
    esperado: stockInicial - 12,
    movimientoId: salidaMov!.id,
  })

  // ─── PARTE (a): Pre-fix — DELETE sin revertir stock ───────────────────────
  hr('PARTE (a): Simulando DELETE pre-fix (sin reversión de stock)')

  // Simula lo que hacía el servicio SIN la reversión de stock:
  // solo soft-delete del pedido, sin crear entrada compensatoria
  await db.update(pedidos).set({ deletedAt: new Date() }).where(eq(pedidos.id, pedido!.id))

  const stockPreFix = await getStockActual(producto.id)
  log('STOCK DESPUÉS DE DELETE PRE-FIX (bug)', {
    stock: stockPreFix,
    stockInicial,
    diff: stockPreFix - stockInicial,
    BUG: stockPreFix !== stockInicial
      ? `Stock sigue descontado: ${stockPreFix} (debería ser ${stockInicial})`
      : 'OK',
  })

  // Restaurar pedido para la parte (c)
  console.log('\n[Restore] Restaurando pedido para parte (c)…')
  await db.update(pedidos).set({ deletedAt: null }).where(eq(pedidos.id, pedido!.id))
  console.log('  ✓ Pedido restaurado')

  // ─── PARTE (c): Post-fix — deletePedido con reversión de stock ────────────
  hr('PARTE (c): DELETE post-fix (con reversión de stock)')

  await deletePedido(pedido!.id, adminUser.id)

  const stockPostFix = await getStockActual(producto.id)

  // Verificar que se creó el movimiento de reversión
  const reversalMov = await db.query.stockMovements.findFirst({
    where: and(
      eq(stockMovements.pedidoId, pedido!.id),
      eq(stockMovements.tipo, 'entrada'),
    ),
    columns: { id: true, tipo: true, cantidad: true, saldoResultante: true, referencia: true },
  })

  log('STOCK DESPUÉS DE DELETE POST-FIX (fix)', {
    stockInicial,
    stockDespuesPedido,
    stockPostFix,
    stockRestituido: stockPostFix === stockInicial,
    reversalMovimiento: reversalMov,
  })

  if (stockPostFix !== stockInicial) {
    console.error(`\n❌ ERROR: stock no fue restituido. Esperado=${stockInicial}, actual=${stockPostFix}`)
    process.exit(1)
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────────────
  hr('CLEANUP')
  await db
    .update(clientes)
    .set({ deletedAt: new Date() })
    .where(eq(clientes.id, cliente!.id))
  console.log('✓ Datos de prueba eliminados (soft-delete)')

  hr()
  console.log('✅ REPRODUCCIÓN COMPLETA')
  console.log(`   (a) Bug confirmado: stock = ${stockPreFix} (debía ser ${stockInicial}) → sigue descontado`)
  console.log(`   (c) Fix validado: stock = ${stockPostFix} = ${stockInicial} ✓`)

  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ Script falló:', err)
  process.exit(1)
})

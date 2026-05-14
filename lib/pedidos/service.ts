import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { pedidos, pedidoItems, productos, movimientosCC, stockMovements } from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { aplicarSaldoAFavorAPedido } from '@/lib/cuenta-corriente/pago.service'
import type { Db } from '@/db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDecimals(a: string, b: string): string {
  const result = parseFloat(a) + parseFloat(b)
  return Math.max(0, result).toFixed(2)
}

// ─── Crear pedido con items ────────────────────────────────────────────────────

/**
 * Crea un pedido + items en una sola transacción y lo deja directamente en
 * estado `confirmado`. Esto incluye:
 *
 *   - validar productos activos
 *   - calcular total
 *   - insertar el pedido (estado='confirmado', saldoPendiente=total)
 *   - insertar los items con snapshot de precio
 *   - insertar movimiento de cuenta corriente (débito por el total)
 *   - generar movimientos de stock (salida por cada item)
 *
 * Después del commit, aplica saldo a favor del cliente si tiene crédito,
 * y re-fetchea el pedido para reflejar el estado de pago final.
 *
 * Se eliminó el paso intermedio `pendiente` porque agregaba fricción al
 * vendedor en campo (un toque más sin valor de negocio). La función
 * `confirmarPedido` queda como compatibilidad para pedidos viejos que
 * estuvieran en pendiente, pero ya no se usa para flujos nuevos.
 */
export async function crearPedidoConItems(
  clienteId: string,
  vendedorId: string,
  fecha: string | null | undefined,
  observaciones: string | null | undefined,
  items: Array<{ productoId: string; cantidad: number }>,
  drizzleDb: Db = db,
  extra?: { creadoPor?: string | null; territorioIdImputado?: string | null; registradoPor?: string | null },
): Promise<typeof pedidos.$inferSelect & { items: (typeof pedidoItems.$inferSelect)[] }> {
  // `registradoPor` es quien deja la huella en CC y stock_movements.
  // Si no se pasa explícitamente, cae al vendedor (caso agent crea su pedido).
  const registradoPor = extra?.registradoPor ?? extra?.creadoPor ?? vendedorId

  const { pedidoCreado, insertedItems, totalCalculado } = await drizzleDb.transaction(async (tx) => {
    // 1. Fetch productos by IDs to get current prices
    const productoIds = items.map((i) => i.productoId)
    const productosRows = await tx.query.productos.findMany({
      where: inArray(productos.id, productoIds),
      columns: { id: true, precio: true, activo: true, nombre: true },
    })

    const productosMap = new Map(productosRows.map((p) => [p.id, p]))

    // Validate all productos exist and are active
    for (const item of items) {
      const producto = productosMap.get(item.productoId)
      if (!producto) {
        throw new NotFoundError(`Producto ${item.productoId}`)
      }
      if (!producto.activo) {
        throw new ValidationError(
          `El producto "${producto.nombre}" no está activo`,
        )
      }
    }

    const fechaDate = fecha ? new Date(fecha) : new Date()

    // Pre-calculate item rows and total before inserting the pedido, so we can
    // store the right total + saldoPendiente from the start.
    const itemsBase = items.map((item) => {
      const producto = productosMap.get(item.productoId)!
      const precioUnitario = producto.precio
      const subtotal = (parseFloat(precioUnitario) * item.cantidad).toFixed(2)
      return { productoId: item.productoId, cantidad: item.cantidad, precioUnitario, subtotal }
    })
    const totalCalculado = itemsBase
      .reduce((sum, item) => sum + parseFloat(item.subtotal), 0)
      .toFixed(2)

    // 2. Insert pedido directly as confirmed
    const [pedido] = await tx
      .insert(pedidos)
      .values({
        clienteId,
        vendedorId,
        creadoPor: extra?.creadoPor ?? null,
        territorioIdImputado: extra?.territorioIdImputado ?? null,
        fecha: fechaDate,
        estado: 'confirmado',
        total: totalCalculado,
        montoPagado: '0',
        saldoPendiente: totalCalculado,
        estadoPago: 'impago',
        observaciones: observaciones ?? null,
      })
      .returning()

    // 3. Insert pedido_items with the pedidoId we now have
    const insertedItems = await tx
      .insert(pedidoItems)
      .values(itemsBase.map(i => ({ ...i, pedidoId: pedido!.id })))
      .returning()

    // 4. Insert débito en cuenta corriente por el total del pedido
    await tx.insert(movimientosCC).values({
      clienteId,
      tipo: 'debito',
      monto: totalCalculado,
      pedidoId: pedido!.id,
      fecha: new Date(),
      descripcion: `Pedido confirmado #${pedido!.id.slice(0, 8)}`,
      registradoPor,
    })

    // 5. Insertar salidas de stock por cada item (saldo resultante = saldo anterior - cantidad)
    for (const item of insertedItems) {
      const [latest] = await tx
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, item.productoId))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)

      const saldoActual = latest?.saldo ?? 0
      await tx.insert(stockMovements).values({
        productoId: item.productoId,
        tipo: 'salida',
        cantidad: item.cantidad,
        saldoResultante: saldoActual - item.cantidad,
        pedidoId: pedido!.id,
        referencia: `Pedido #${pedido!.id.slice(0, 8)}`,
        registradoPor,
      })
    }

    return { pedidoCreado: pedido!, insertedItems, totalCalculado }
  })

  // 6. Aplicar saldo a favor del cliente fuera de la transacción principal
  //    (mismo patrón que confirmarPedido). Si falla, no rompe la creación.
  try {
    await aplicarSaldoAFavorAPedido(
      clienteId,
      pedidoCreado.id,
      drizzleDb,
      registradoPor,
    )
  } catch {
    console.warn(
      `[crearPedidoConItems] No se pudo aplicar saldo a favor al pedido ${pedidoCreado.id}`,
    )
  }

  // 7. Re-fetch pedido para reflejar cualquier aplicación de saldo a favor
  const finalPedido = await drizzleDb.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoCreado.id),
  })

  return {
    ...(finalPedido ?? pedidoCreado),
    total: totalCalculado,
    items: insertedItems,
  }
}

// ─── Confirmar pedido ─────────────────────────────────────────────────────────

export async function confirmarPedido(
  pedidoId: string,
  userId: string,
  drizzleDb: Db = db,
): Promise<typeof pedidos.$inferSelect> {
  const resultado = await drizzleDb.transaction(async (tx) => {
    // 1. Fetch pedido with items
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      with: {
        items: true,
      },
    })

    if (!pedido) throw new NotFoundError('Pedido')

    if (pedido.estado !== 'pendiente') {
      throw new ValidationError(
        `Solo se pueden confirmar pedidos en estado pendiente (estado actual: ${pedido.estado})`,
      )
    }

    // 2. Calculate total from items (sum of subtotals)
    const total = pedido.items.reduce(
      (sum, item) => addDecimals(sum, item.subtotal),
      '0.00',
    )

    // 3. Update pedido: estado='confirmado', total, saldoPendiente=total
    const [updated] = await tx
      .update(pedidos)
      .set({
        estado: 'confirmado',
        total,
        saldoPendiente: total,
        montoPagado: '0',
        estadoPago: 'impago',
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))
      .returning()

    // 4. Insert movimientosCC: tipo='debito'
    await tx.insert(movimientosCC).values({
      clienteId: pedido.clienteId,
      tipo: 'debito',
      monto: total,
      pedidoId,
      fecha: new Date(),
      descripcion: `Pedido confirmado #${pedidoId.slice(0, 8)}`,
      registradoPor: userId,
    })

    // 5. Create stock salida movements for each item
    for (const item of pedido.items) {
      const [latest] = await tx
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, item.productoId))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)

      const saldoActual = latest?.saldo ?? 0
      const nuevoSaldo = saldoActual - item.cantidad

      await tx.insert(stockMovements).values({
        productoId: item.productoId,
        tipo: 'salida',
        cantidad: item.cantidad,
        saldoResultante: nuevoSaldo,
        pedidoId,
        referencia: `Pedido #${pedidoId.slice(0, 8)}`,
        registradoPor: userId,
      })
    }

    return updated!
  })

  // 5. Apply saldo a favor after main transaction commits
  try {
    await aplicarSaldoAFavorAPedido(
      resultado.clienteId,
      resultado.id,
      drizzleDb,
      userId,
    )
  } catch {
    // Non-fatal: log but don't fail the confirmation
    console.warn(
      `[confirmarPedido] No se pudo aplicar saldo a favor al pedido ${pedidoId}`,
    )
  }

  // Re-fetch to return the updated version after potential payment application
  const final = await drizzleDb.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoId),
  })

  return final ?? resultado
}

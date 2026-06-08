import { eq, and, isNull, ne, sql, inArray, or } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes,
  pedidos,
  pedidoItems,
  movimientosCC,
  aplicacionesPago,
  stockMovements,
  documentosEmitidos,
  actividadesCliente,
  historialTeritorioCliente,
  leads,
  conversations,
  messages,
  attachments,
  leadTags,
  activityLog,
  productos,
} from '@/db/schema'
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors'
import { calcularDistribucionFIFO, type PedidoPendiente } from '@/lib/cuenta-corriente/pago.service'

// ─── deleteCliente ─────────────────────────────────────────────────────────────

export async function deleteCliente(clienteId: string, _deletedBy: string): Promise<void> {
  // Check 1: any active pedido for this client
  const activePedido = await db.query.pedidos.findFirst({
    where: and(
      eq(pedidos.clienteId, clienteId),
      isNull(pedidos.deletedAt),
    ),
    columns: { id: true },
  })

  if (activePedido) {
    throw new ValidationError('El cliente tiene pedidos activos')
  }

  // Check 2: cuenta corriente must be zero
  // SUM(CASE WHEN tipo='credito' THEN monto ELSE -monto END) WHERE deleted_at IS NULL
  const balanceResult = await db
    .select({
      balance: sql<string>`
        COALESCE(
          SUM(CASE WHEN ${movimientosCC.tipo} = 'credito' THEN ${movimientosCC.monto}::numeric
                   ELSE -${movimientosCC.monto}::numeric END
          ), 0
        )
      `.as('balance'),
    })
    .from(movimientosCC)
    .where(and(eq(movimientosCC.clienteId, clienteId), isNull(movimientosCC.deletedAt)))

  const balance = parseFloat(balanceResult[0]?.balance ?? '0')

  if (Math.abs(balance) > 0.001) {
    throw new ValidationError('La cuenta corriente del cliente no está en cero')
  }

  // Soft-delete the client
  await db
    .update(clientes)
    .set({ deletedAt: new Date() })
    .where(eq(clientes.id, clienteId))
}

// ─── purgeClienteCompleto ──────────────────────────────────────────────────────
// Hard-delete a client and ALL associated data in FK-safe order.
// Admin-only. Does NOT soft-delete — rows are physically removed.

export async function purgeClienteCompleto(clienteId: string, deletedBy: string): Promise<void> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
    columns: { id: true, leadId: true, nombre: true, apellido: true },
  })
  if (!cliente) throw new NotFoundError('Cliente')

  console.log(`[purge] admin=${deletedBy} purging cliente=${clienteId} (${cliente.nombre} ${cliente.apellido ?? ''})`)

  await db.transaction(async (tx) => {
    // 1. Collect pedido IDs for this client
    const pedidoRows = await tx
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(eq(pedidos.clienteId, clienteId))
    const pedidoIds = pedidoRows.map((r) => r.id)

    // 2. Collect movimientosCC IDs for this client (needed to cover all aplicaciones_pago)
    const movRows = await tx
      .select({ id: movimientosCC.id })
      .from(movimientosCC)
      .where(eq(movimientosCC.clienteId, clienteId))
    const movIds = movRows.map((r) => r.id)

    // 3. Delete aplicaciones_pago linked to client pedidos OR client credit movements
    if (pedidoIds.length > 0 || movIds.length > 0) {
      const conditions = []
      if (pedidoIds.length > 0) conditions.push(inArray(aplicacionesPago.pedidoId, pedidoIds))
      if (movIds.length > 0) conditions.push(inArray(aplicacionesPago.movimientoCreditoId, movIds))
      await tx.delete(aplicacionesPago).where(or(...conditions))
    }

    // 4. Delete documentos_emitidos linked to client pedidos
    if (pedidoIds.length > 0) {
      await tx.delete(documentosEmitidos).where(inArray(documentosEmitidos.pedidoId, pedidoIds))
    }

    // 5. Delete stock_movements linked to client pedidos (no stock adjustment per spec)
    if (pedidoIds.length > 0) {
      await tx.delete(stockMovements).where(inArray(stockMovements.pedidoId, pedidoIds))
    }

    // 6. Delete pedido_items linked to client pedidos
    if (pedidoIds.length > 0) {
      await tx.delete(pedidoItems).where(inArray(pedidoItems.pedidoId, pedidoIds))
    }

    // 7. Delete movimientos_cc for this client
    await tx.delete(movimientosCC).where(eq(movimientosCC.clienteId, clienteId))

    // 8. Delete pedidos for this client
    await tx.delete(pedidos).where(eq(pedidos.clienteId, clienteId))

    // 9. Delete actividades_cliente for this client
    await tx.delete(actividadesCliente).where(eq(actividadesCliente.clienteId, clienteId))

    // 10. Delete historial_territorio_cliente for this client
    await tx.delete(historialTeritorioCliente).where(eq(historialTeritorioCliente.clienteId, clienteId))

    // 11. Delete the client BEFORE the lead — clientes.leadId references leads.id,
    //     so the lead cannot be deleted while the client row still exists.
    await tx.delete(clientes).where(eq(clientes.id, clienteId))

    // 12. If client had an originating lead, purge it and its dependents.
    //     The client row is gone at this point so the FK is no longer violated.
    if (cliente.leadId) {
      const leadId = cliente.leadId

      // Find the conversation (if any)
      const conv = await tx.query.conversations.findFirst({
        where: eq(conversations.leadId, leadId),
        columns: { id: true },
      })

      if (conv) {
        // a. Collect message IDs to delete attachments
        const msgRows = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
        const msgIds = msgRows.map((r) => r.id)

        if (msgIds.length > 0) {
          await tx.delete(attachments).where(inArray(attachments.messageId, msgIds))
        }
        await tx.delete(messages).where(eq(messages.conversationId, conv.id))
        await tx.delete(conversations).where(eq(conversations.id, conv.id))
      }

      // b. Delete activity_log for this lead
      await tx.delete(activityLog).where(eq(activityLog.leadId, leadId))

      // c. Delete lead_tags (cascade would handle it, but explicit for safety)
      await tx.delete(leadTags).where(eq(leadTags.leadId, leadId))

      // d. Defensive: null out any other client still pointing to this lead before deleting it
      await tx.update(clientes).set({ leadId: null }).where(eq(clientes.leadId, leadId))

      // e. Delete the lead
      await tx.delete(leads).where(eq(leads.id, leadId))
    }
  })

  console.log(`[purge] completed: cliente=${clienteId} permanently deleted by admin=${deletedBy}`)
}

// ─── deletePedido ──────────────────────────────────────────────────────────────

export async function deletePedido(pedidoId: string, deletedBy: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Fetch pedido
    const pedido = await tx.query.pedidos.findFirst({
      where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
      columns: { id: true, clienteId: true, total: true, fecha: true },
    })
    if (!pedido) throw new NotFoundError('Pedido')

    // 2. Guard: block deletion if the pedido has active applied payments.
    //    Deleting without this check leaves crédito movimientosCC alive (orphaned)
    //    and generates a false saldo a favor on the client's cuenta corriente.
    const pagoAplicado = await tx.query.aplicacionesPago.findFirst({
      where: and(
        eq(aplicacionesPago.pedidoId, pedidoId),
        isNull(aplicacionesPago.deletedAt),
      ),
      columns: { id: true },
    })
    if (pagoAplicado) {
      throw new ConflictError(
        'No se puede eliminar un pedido con pagos aplicados. Usá Anular.',
      )
    }

    // 3. Find the débito movimiento linked to this pedido
    const debitoMovimiento = await tx.query.movimientosCC.findFirst({
      where: and(
        eq(movimientosCC.pedidoId, pedidoId),
        eq(movimientosCC.tipo, 'debito'),
        isNull(movimientosCC.deletedAt),
      ),
      columns: { id: true },
    })

    // 4. Soft-delete all aplicaciones_pago linked to this pedido
    await tx
      .update(aplicacionesPago)
      .set({ deletedAt: new Date() })
      .where(and(eq(aplicacionesPago.pedidoId, pedidoId), isNull(aplicacionesPago.deletedAt)))

    // 5. Soft-delete the débito movimiento (if it exists)
    if (debitoMovimiento) {
      await tx
        .update(movimientosCC)
        .set({ deletedAt: new Date() })
        .where(eq(movimientosCC.id, debitoMovimiento.id))
    }

    // 6. Revert stock: create compensating 'entrada' movements for any net-deducted stock.
    //    Algorithm: sum(salidas) - sum(entradas) per product for this pedidoId.
    //    If netDeducted > 0, create one 'entrada' to balance it.
    //    This is idempotent: if a prior revert already restored stock (e.g. via
    //    revertirPedidoAAprobacion), netDeducted will be 0 and no movement is created.
    const existingStockMovs = await tx
      .select({
        productoId: stockMovements.productoId,
        tipo: stockMovements.tipo,
        cantidad: stockMovements.cantidad,
      })
      .from(stockMovements)
      .where(eq(stockMovements.pedidoId, pedidoId))

    // Build net map: positive = net deducted (salidas > entradas)
    const netByProducto = new Map<string, number>()
    for (const mov of existingStockMovs) {
      if (mov.tipo !== 'salida' && mov.tipo !== 'entrada') continue
      const prev = netByProducto.get(mov.productoId) ?? 0
      netByProducto.set(
        mov.productoId,
        mov.tipo === 'salida' ? prev + mov.cantidad : prev - mov.cantidad,
      )
    }

    for (const [productoId, netDeducted] of netByProducto.entries()) {
      if (netDeducted <= 0) continue // already balanced — skip

      // Latest saldoResultante for this product (across ALL movements, not just this pedido)
      const [latest] = await tx
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, productoId))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)

      const saldoActual = latest?.saldo ?? 0

      await tx.insert(stockMovements).values({
        productoId,
        tipo: 'entrada',
        cantidad: netDeducted,
        saldoResultante: saldoActual + netDeducted,
        pedidoId,
        referencia: `Reverso por eliminación pedido #${pedidoId.slice(0, 8)}`,
        notas: 'Reversión automática de stock al eliminar el pedido',
        registradoPor: deletedBy,
      })
    }

    // 7. Soft-delete the pedido itself
    await tx
      .update(pedidos)
      .set({ deletedAt: new Date() })
      .where(eq(pedidos.id, pedidoId))

    // 8. Recalculate FIFO for remaining active pedidos of this client
    const clienteId = pedido.clienteId

    // Fetch all active créditos for this client ordered by fecha ASC
    const creditos = await tx.query.movimientosCC.findMany({
      where: and(
        eq(movimientosCC.clienteId, clienteId),
        eq(movimientosCC.tipo, 'credito'),
        isNull(movimientosCC.deletedAt),
      ),
      columns: { id: true, monto: true, fecha: true },
      orderBy: (m, { asc }) => [asc(m.fecha)],
    })

    // Fetch all active pedidos that are not fully paid, ordered by fecha ASC
    const pedidosActivos = await tx.query.pedidos.findMany({
      where: and(
        eq(pedidos.clienteId, clienteId),
        isNull(pedidos.deletedAt),
        ne(pedidos.estadoPago, 'pagado'),
      ),
      columns: { id: true, fecha: true, total: true },
      orderBy: (p, { asc }) => [asc(p.fecha)],
    })

    // Reset all active pedidos montoPagado/saldoPendiente/estadoPago to recalculate from scratch
    for (const p of pedidosActivos) {
      await tx
        .update(pedidos)
        .set({
          montoPagado: '0.00',
          saldoPendiente: p.total,
          estadoPago: 'impago',
          updatedAt: new Date(),
        })
        .where(eq(pedidos.id, p.id))
    }

    // Re-apply each crédito via FIFO distribution
    const pendientesParaFIFO: PedidoPendiente[] = pedidosActivos.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      saldoPendiente: p.total,
    }))

    // Track running saldos
    const saldoMap: Map<string, string> = new Map(
      pendientesParaFIFO.map((p) => [p.id, p.saldoPendiente]),
    )

    for (const credito of creditos) {
      const pendientes: PedidoPendiente[] = pendientesParaFIFO
        .map((p) => ({ ...p, saldoPendiente: saldoMap.get(p.id) ?? p.saldoPendiente }))
        .filter((p) => parseFloat(p.saldoPendiente) > 0)

      if (pendientes.length === 0) break

      const distribucion = calcularDistribucionFIFO(credito.monto, pendientes)

      for (const aplicacion of distribucion.aplicaciones) {
        const pedidoTotal = parseFloat(
          pedidosActivos.find((p) => p.id === aplicacion.pedidoId)!.total,
        )
        const newMontoPagado = Math.max(0, pedidoTotal - parseFloat(aplicacion.saldoRestante)).toFixed(2)

        saldoMap.set(aplicacion.pedidoId, aplicacion.saldoRestante)

        await tx
          .update(pedidos)
          .set({
            montoPagado: newMontoPagado,
            saldoPendiente: aplicacion.saldoRestante,
            estadoPago: aplicacion.estadoPago,
            updatedAt: new Date(),
          })
          .where(eq(pedidos.id, aplicacion.pedidoId))
      }
    }
  })
}

// ─── deleteMovimientoCC ────────────────────────────────────────────────────────

export async function deleteMovimientoCC(movimientoId: string, _deletedBy: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Fetch movimiento
    const movimiento = await tx.query.movimientosCC.findFirst({
      where: and(eq(movimientosCC.id, movimientoId), isNull(movimientosCC.deletedAt)),
      columns: { id: true, tipo: true, clienteId: true, monto: true },
    })

    if (!movimiento) throw new NotFoundError('Movimiento')

    if (movimiento.tipo === 'debito') {
      throw new ValidationError(
        'No se pueden eliminar débitos directamente. Eliminá el pedido correspondiente.',
      )
    }

    // 2. Find pedidos affected by this crédito (via aplicaciones_pago)
    const aplicacionesAfectadas = await tx.query.aplicacionesPago.findMany({
      where: and(
        eq(aplicacionesPago.movimientoCreditoId, movimientoId),
        isNull(aplicacionesPago.deletedAt),
      ),
      columns: { id: true, pedidoId: true, montoAplicado: true },
    })

    const pedidosAfectadosIds = [...new Set(aplicacionesAfectadas.map((a) => a.pedidoId))]

    // 3. Soft-delete all aplicaciones_pago linked to this crédito
    await tx
      .update(aplicacionesPago)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(aplicacionesPago.movimientoCreditoId, movimientoId),
          isNull(aplicacionesPago.deletedAt),
        ),
      )

    // 4. Soft-delete the movimiento itself
    await tx
      .update(movimientosCC)
      .set({ deletedAt: new Date() })
      .where(eq(movimientosCC.id, movimientoId))

    // 5. Recalculate affected pedidos from remaining active aplicaciones
    for (const pedidoId of pedidosAfectadosIds) {
      const pedidoActual = await tx.query.pedidos.findFirst({
        where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
        columns: { id: true, total: true },
      })
      if (!pedidoActual) continue

      const aplicacionesActivas = await tx.query.aplicacionesPago.findMany({
        where: and(
          eq(aplicacionesPago.pedidoId, pedidoId),
          isNull(aplicacionesPago.deletedAt),
        ),
        columns: { montoAplicado: true },
      })

      const nuevoMontoPagado = aplicacionesActivas
        .reduce((sum, a) => sum + parseFloat(a.montoAplicado), 0)
        .toFixed(2)

      const total = parseFloat(pedidoActual.total)
      const pagado = parseFloat(nuevoMontoPagado)
      const nuevoSaldo = Math.max(0, total - pagado).toFixed(2)

      let estadoPago: 'impago' | 'parcial' | 'pagado'
      if (pagado <= 0) {
        estadoPago = 'impago'
      } else if (parseFloat(nuevoSaldo) <= 0.001) {
        estadoPago = 'pagado'
      } else {
        estadoPago = 'parcial'
      }

      await tx
        .update(pedidos)
        .set({
          montoPagado: nuevoMontoPagado,
          saldoPendiente: nuevoSaldo,
          estadoPago,
          updatedAt: new Date(),
        })
        .where(eq(pedidos.id, pedidoId))
    }
  })
}

// ─── deleteProducto ────────────────────────────────────────────────────────────

export async function deleteProducto(productoId: string, _deletedBy: string): Promise<void> {
  const existing = await db.query.productos.findFirst({
    where: and(eq(productos.id, productoId), isNull(productos.deletedAt)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('Producto')

  await db
    .update(productos)
    .set({ deletedAt: new Date() })
    .where(eq(productos.id, productoId))
}

// ─── deleteLead ────────────────────────────────────────────────────────────────

export async function deleteLead(leadId: string, _deletedBy: string): Promise<void> {
  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), isNull(leads.deletedAt)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('Lead')

  await db
    .update(leads)
    .set({ deletedAt: new Date() })
    .where(eq(leads.id, leadId))
}

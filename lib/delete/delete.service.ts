import { eq, and, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes,
  pedidos,
  movimientosCC,
  aplicacionesPago,
  productos,
  leads,
} from '@/db/schema'
import { ValidationError, NotFoundError } from '@/lib/errors'
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

// ─── deletePedido ──────────────────────────────────────────────────────────────

export async function deletePedido(pedidoId: string, _deletedBy: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Fetch pedido
    const pedido = await tx.query.pedidos.findFirst({
      where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
      columns: { id: true, clienteId: true, total: true, fecha: true },
    })
    if (!pedido) throw new NotFoundError('Pedido')

    // 2. Find the débito movimiento linked to this pedido
    const debitoMovimiento = await tx.query.movimientosCC.findFirst({
      where: and(
        eq(movimientosCC.pedidoId, pedidoId),
        eq(movimientosCC.tipo, 'debito'),
        isNull(movimientosCC.deletedAt),
      ),
      columns: { id: true },
    })

    // 3. Soft-delete all aplicaciones_pago linked to this pedido
    await tx
      .update(aplicacionesPago)
      .set({ deletedAt: new Date() })
      .where(and(eq(aplicacionesPago.pedidoId, pedidoId), isNull(aplicacionesPago.deletedAt)))

    // 4. Soft-delete the débito movimiento (if it exists)
    if (debitoMovimiento) {
      await tx
        .update(movimientosCC)
        .set({ deletedAt: new Date() })
        .where(eq(movimientosCC.id, debitoMovimiento.id))
    }

    // 5. Soft-delete the pedido itself
    await tx
      .update(pedidos)
      .set({ deletedAt: new Date() })
      .where(eq(pedidos.id, pedidoId))

    // 6. Recalculate FIFO for remaining active pedidos of this client
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

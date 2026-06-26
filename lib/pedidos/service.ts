import { eq, inArray, sql, and, isNull } from 'drizzle-orm'
import { db } from '@/db'
import {
  pedidos, pedidoItems, productos, movimientosCC, stockMovements, aplicacionesPago,
} from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { aplicarSaldoAFavorAPedido, recalcularPagosPedido, reconciliarCuentaCliente } from '@/lib/cuenta-corriente/pago.service'
import { parseFechaAR, todayStrAR } from '@/lib/dates'
import type { Db } from '@/db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDecimals(a: string, b: string): string {
  const result = parseFloat(a) + parseFloat(b)
  return Math.max(0, result).toFixed(2)
}

// ─── Crear pedido con items ────────────────────────────────────────────────────

/**
 * Crea un pedido + items en una sola transacción.
 *
 * Cuando `extra.crearComoPendienteAprobacion === true` (pedidos de agentes):
 *   - Estado = `pendiente_aprobacion`; NO se crean movimientos de CC ni stock.
 *   - Los movimientos se crearán cuando el gerente/admin apruebe el pedido.
 *
 * En el flujo normal (confirmado directo):
 *   - Estado = `confirmado`; se crean CC débito, stock salidas y se aplica saldo a favor.
 */
export async function crearPedidoConItems(
  clienteId: string,
  vendedorId: string,
  fecha: string | null | undefined,
  observaciones: string | null | undefined,
  items: Array<{ productoId: string; cantidad: number; precioUnitario?: number }>,
  drizzleDb: Db = db,
  extra?: {
    creadoPor?: string | null
    territorioIdImputado?: string | null
    registradoPor?: string | null
    crearComoPendienteAprobacion?: boolean
    /** Solo para rol Agente: método de entrega del pedido */
    metodoEntrega?: 'retiro_fabrica' | 'expreso' | null
    /** Nombre del expreso (dónde despachar) — solo si metodoEntrega = 'expreso' */
    expresoNombre?: string | null
    /** Dirección del expreso (dónde despachar) — solo si metodoEntrega = 'expreso' */
    expresoDireccion?: string | null
    /** true para pedidos de camioneta (rol vendedor) */
    esReparto?: boolean
    /** Porcentaje de descuento 0-100 */
    descuento?: number
  },
): Promise<typeof pedidos.$inferSelect & { items: (typeof pedidoItems.$inferSelect)[] }> {
  const registradoPor = extra?.registradoPor ?? extra?.creadoPor ?? vendedorId
  const esPendienteAprobacion = extra?.crearComoPendienteAprobacion ?? false

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

    // Guardar como medianoche AR (no el instante UTC). El instante exacto de
    // creación queda en createdAt (defaultNow). Así la fecha de negocio del
    // pedido coincide en todas las pantallas sin desfase de día.
    const fechaDate = fecha ? parseFechaAR(fecha.slice(0, 10)) : parseFechaAR(todayStrAR())

    const itemsBase = items.map((item) => {
      const producto = productosMap.get(item.productoId)!
      // Precio custom si se envió; si no, el precio actual del producto.
      const precioUnitario = item.precioUnitario != null ? item.precioUnitario.toFixed(2) : producto.precio
      const subtotal = (parseFloat(precioUnitario) * item.cantidad).toFixed(2)
      return { productoId: item.productoId, cantidad: item.cantidad, precioUnitario, subtotal }
    })
    const subtotalCalculado = itemsBase.reduce((sum, item) => sum + parseFloat(item.subtotal), 0)
    const descuentoPct = extra?.descuento ?? 0
    const totalCalculado = (subtotalCalculado - subtotalCalculado * (descuentoPct / 100)).toFixed(2)

    // 2. Insert pedido
    const [pedido] = await tx
      .insert(pedidos)
      .values({
        clienteId,
        vendedorId,
        creadoPor: extra?.creadoPor ?? null,
        territorioIdImputado: extra?.territorioIdImputado ?? null,
        fecha: fechaDate,
        estado: esPendienteAprobacion ? 'pendiente_aprobacion' : 'confirmado',
        total: totalCalculado,
        descuento: descuentoPct.toFixed(2),
        montoPagado: '0',
        saldoPendiente: totalCalculado,
        estadoPago: 'impago',
        observaciones: observaciones ?? null,
        metodoEntrega: extra?.metodoEntrega ?? null,
        expresoNombre: extra?.expresoNombre ?? null,
        expresoDireccion: extra?.expresoDireccion ?? null,
        esReparto: extra?.esReparto ?? false,
      })
      .returning()

    // 3. Insert pedido_items
    const insertedItems = await tx
      .insert(pedidoItems)
      .values(itemsBase.map(i => ({ ...i, pedidoId: pedido!.id })))
      .returning()

    // 4. Only for confirmed orders: CC debit + stock salidas
    if (!esPendienteAprobacion) {
      await tx.insert(movimientosCC).values({
        clienteId,
        tipo: 'debito',
        monto: totalCalculado,
        pedidoId: pedido!.id,
        fecha: new Date(),
        descripcion: `Pedido confirmado #${pedido!.id.slice(0, 8)}`,
        registradoPor,
      })

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
    }

    return { pedidoCreado: pedido!, insertedItems, totalCalculado }
  })

  // 5. Aplicar saldo a favor sólo para pedidos confirmados directamente
  if (!esPendienteAprobacion) {
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
  }

  // 6. Re-fetch para reflejar estado final
  const finalPedido = await drizzleDb.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoCreado.id),
  })

  return {
    ...(finalPedido ?? pedidoCreado),
    total: totalCalculado,
    items: insertedItems,
  }
}

// ─── Confirmar pedido (legacy: pendiente → confirmado) ────────────────────────

/**
 * Transición legacy `pendiente` → `confirmado`.
 * Queda como compatibilidad para pedidos viejos. Para el flujo de aprobación
 * de agentes usar `aprobarPedido`.
 */
export async function confirmarPedido(
  pedidoId: string,
  userId: string,
  drizzleDb: Db = db,
): Promise<typeof pedidos.$inferSelect> {
  const resultado = await drizzleDb.transaction(async (tx) => {
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

    const total = pedido.items.reduce(
      (sum, item) => addDecimals(sum, item.subtotal),
      '0.00',
    )

    const [updated] = await tx
      .update(pedidos)
      .set({
        estado: 'confirmado',
        total,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))
      .returning()

    await tx.insert(movimientosCC).values({
      clienteId: pedido.clienteId,
      tipo: 'debito',
      monto: total,
      pedidoId,
      fecha: new Date(),
      descripcion: `Pedido confirmado #${pedidoId.slice(0, 8)}`,
      registradoPor: userId,
    })

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

    // Sync payment fields from live aplicaciones_pago (preserves any prior payments)
    await recalcularPagosPedido(tx as unknown as Db, pedidoId)

    return updated!
  })

  try {
    await aplicarSaldoAFavorAPedido(
      resultado.clienteId,
      resultado.id,
      drizzleDb,
      userId,
    )
  } catch {
    console.warn(
      `[confirmarPedido] No se pudo aplicar saldo a favor al pedido ${pedidoId}`,
    )
  }

  const final = await drizzleDb.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoId),
  })

  return final ?? resultado
}

// ─── Aprobar pedido (pendiente_aprobacion → confirmado) ───────────────────────

/**
 * Aprueba un pedido creado por un agente.
 * Valida que el pedido esté en `pendiente_aprobacion`, luego:
 *   - Crea el movimiento de CC (débito)
 *   - Crea los movimientos de stock (salidas)
 *   - Aplica saldo a favor del cliente si existe
 *   - Transiciona a `confirmado`
 *
 * La autorización (gerente sólo puede aprobar sus agentes) se valida en la ruta.
 */
export async function aprobarPedido(
  pedidoId: string,
  userId: string,
  drizzleDb: Db = db,
): Promise<typeof pedidos.$inferSelect> {
  const resultado = await drizzleDb.transaction(async (tx) => {
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      with: { items: true },
    })

    if (!pedido) throw new NotFoundError('Pedido')

    if (pedido.estado !== 'pendiente_aprobacion') {
      throw new ValidationError(
        `Solo se pueden aprobar pedidos en estado pendiente de aprobación (estado actual: ${pedido.estado})`,
      )
    }

    const total = pedido.items.reduce(
      (sum, item) => addDecimals(sum, item.subtotal),
      '0.00',
    )

    const [updated] = await tx
      .update(pedidos)
      .set({
        estado: 'confirmado',
        total,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))
      .returning()

    await tx.insert(movimientosCC).values({
      clienteId: pedido.clienteId,
      tipo: 'debito',
      monto: total,
      pedidoId,
      fecha: new Date(),
      descripcion: `Pedido aprobado #${pedidoId.slice(0, 8)}`,
      registradoPor: userId,
    })

    for (const item of pedido.items) {
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
        pedidoId,
        referencia: `Pedido #${pedidoId.slice(0, 8)}`,
        registradoPor: userId,
      })
    }

    // Sync payment fields from live aplicaciones_pago (preserves any prior payments)
    await recalcularPagosPedido(tx as unknown as Db, pedidoId)

    // Imputar cualquier saldo a favor del cliente (FIFO) dentro de la misma
    // transacción: un crédito registrado antes de que existiera el pedido se
    // aplica recién ahora. Si falla, la aprobación entera se revierte.
    await reconciliarCuentaCliente(tx as unknown as Db, pedido.clienteId)

    return updated!
  })

  const final = await drizzleDb.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoId),
  })

  return final ?? resultado
}

// ─── Revertir pedido (confirmado → pendiente_aprobacion) ─────────────────────

/**
 * Revierte un pedido confirmado a `pendiente_aprobacion` para permitir
 * que el agente vuelva a editarlo.
 *
 * Efectos:
 *   - Soft-delete del movimiento CC débito asociado al pedido
 *   - Soft-delete de aplicaciones de pago vinculadas
 *   - Movimientos de stock compensatorios (entradas por cada salida)
 *   - Resetea montoPagado=0, saldoPendiente=total, estadoPago='impago'
 *
 * La autorización (gerente sólo puede revertir sus agentes) se valida en la ruta.
 */
export async function revertirPedidoAAprobacion(
  pedidoId: string,
  userId: string,
  drizzleDb: Db = db,
): Promise<typeof pedidos.$inferSelect> {
  return drizzleDb.transaction(async (tx) => {
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      with: { items: true },
    })

    if (!pedido) throw new NotFoundError('Pedido')

    if (pedido.estado !== 'confirmado') {
      throw new ValidationError(
        `Solo se pueden revertir pedidos en estado confirmado (estado actual: ${pedido.estado})`,
      )
    }

    // 1. Soft-delete CC débito asociado al pedido
    await tx
      .update(movimientosCC)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(movimientosCC.pedidoId, pedidoId),
          eq(movimientosCC.tipo, 'debito'),
          isNull(movimientosCC.deletedAt),
        ),
      )

    // 2. Soft-delete aplicaciones de pago vinculadas al pedido
    await tx
      .update(aplicacionesPago)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(aplicacionesPago.pedidoId, pedidoId),
          isNull(aplicacionesPago.deletedAt),
        ),
      )

    // 3. Entradas de stock para compensar las salidas previas
    for (const item of pedido.items) {
      const [latest] = await tx
        .select({ saldo: stockMovements.saldoResultante })
        .from(stockMovements)
        .where(eq(stockMovements.productoId, item.productoId))
        .orderBy(sql`${stockMovements.createdAt} DESC`)
        .limit(1)

      const saldoActual = latest?.saldo ?? 0

      await tx.insert(stockMovements).values({
        productoId: item.productoId,
        tipo: 'entrada',
        cantidad: item.cantidad,
        saldoResultante: saldoActual + item.cantidad,
        pedidoId,
        referencia: `Revert #${pedidoId.slice(0, 8)}`,
        notas: 'Revertido a pendiente de aprobación',
        registradoPor: userId,
      })
    }

    // 4. Actualizar estado del pedido
    const [updated] = await tx
      .update(pedidos)
      .set({
        estado: 'pendiente_aprobacion',
        montoPagado: '0',
        saldoPendiente: pedido.total,
        estadoPago: 'impago',
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))
      .returning()

    return updated!
  })
}

// ─── Actualizar items de un pedido ────────────────────────────────────────────

/**
 * Actualiza los items, fecha y observaciones de un pedido existente.
 *
 * - Para estados `pendiente` / `pendiente_aprobacion`: no hay movimientos de CC
 *   ni stock, se reemplazan los items y se recalcula el total directamente.
 * - Para estados `confirmado`+: se soft-deletean el CC débito existente,
 *   se insertan entradas de stock compensatorias, se reemplazan los items,
 *   se inserta el nuevo CC débito y las nuevas salidas de stock, y se
 *   recalculan los pagos aplicados.
 *
 * La autorización (admin vs. agent/vendedor) se valida en la ruta antes de llamar aquí.
 */
const ESTADOS_CON_MOVIMIENTOS = new Set(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])

export async function actualizarItemsPedido(
  pedidoId: string,
  newItems: Array<{ productoId: string; cantidad: number; precioUnitario?: number }>,
  updates: { fecha?: string | null; observaciones?: string | null; descuento?: number },
  userId: string,
  drizzleDb: Db = db,
): Promise<typeof pedidos.$inferSelect> {
  const resultado = await drizzleDb.transaction(async (tx) => {
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      with: { items: true },
    })
    if (!pedido) throw new NotFoundError('Pedido')

    const productoIds = newItems.map(i => i.productoId)
    const productosRows = await tx.query.productos.findMany({
      where: inArray(productos.id, productoIds),
      columns: { id: true, precio: true, activo: true, nombre: true },
    })
    const productosMap = new Map(productosRows.map(p => [p.id, p]))
    for (const item of newItems) {
      const producto = productosMap.get(item.productoId)
      if (!producto) throw new NotFoundError(`Producto ${item.productoId}`)
      if (!producto.activo) throw new ValidationError(`El producto "${producto.nombre}" no está activo`)
    }

    const descuentoPct = updates.descuento ?? parseFloat(pedido.descuento ?? '0')
    const newItemsRows = newItems.map(item => {
      const producto = productosMap.get(item.productoId)!
      const precioUnitario = item.precioUnitario != null ? item.precioUnitario.toFixed(2) : producto.precio
      const subtotal = (parseFloat(precioUnitario) * item.cantidad).toFixed(2)
      return { pedidoId, productoId: item.productoId, cantidad: item.cantidad, precioUnitario, subtotal }
    })
    const subtotalNuevo = newItemsRows.reduce((s, i) => s + parseFloat(i.subtotal), 0)
    const totalNuevo = (subtotalNuevo - subtotalNuevo * (descuentoPct / 100)).toFixed(2)

    const conMovimientos = ESTADOS_CON_MOVIMIENTOS.has(pedido.estado)

    // 1. Reemplazar items
    await tx.delete(pedidoItems).where(eq(pedidoItems.pedidoId, pedidoId))
    await tx.insert(pedidoItems).values(newItemsRows)

    // 2. Actualizar pedido
    const pedidoUpdates: Partial<typeof pedidos.$inferInsert> = {
      total: totalNuevo,
      descuento: descuentoPct.toFixed(2),
      updatedAt: new Date(),
    }
    if (!conMovimientos) pedidoUpdates.saldoPendiente = totalNuevo
    if (updates.fecha !== undefined) pedidoUpdates.fecha = updates.fecha ? parseFechaAR(updates.fecha.slice(0, 10)) : parseFechaAR(todayStrAR())
    if (updates.observaciones !== undefined) pedidoUpdates.observaciones = updates.observaciones

    const [updated] = await tx
      .update(pedidos)
      .set(pedidoUpdates)
      .where(eq(pedidos.id, pedidoId))
      .returning()

    // 3. Ajustar CC y stock para estados con movimientos (solo admin puede llegar aquí)
    if (conMovimientos) {
      await tx
        .update(movimientosCC)
        .set({ deletedAt: new Date() })
        .where(and(eq(movimientosCC.pedidoId, pedidoId), eq(movimientosCC.tipo, 'debito'), isNull(movimientosCC.deletedAt)))

      for (const item of pedido.items) {
        const [latest] = await tx
          .select({ saldo: stockMovements.saldoResultante })
          .from(stockMovements)
          .where(eq(stockMovements.productoId, item.productoId))
          .orderBy(sql`${stockMovements.createdAt} DESC`)
          .limit(1)
        const saldoActual = latest?.saldo ?? 0
        await tx.insert(stockMovements).values({
          productoId: item.productoId, tipo: 'entrada', cantidad: item.cantidad,
          saldoResultante: saldoActual + item.cantidad, pedidoId,
          referencia: `Edición #${pedidoId.slice(0, 8)}`, registradoPor: userId,
        })
      }

      await tx.insert(movimientosCC).values({
        clienteId: pedido.clienteId, tipo: 'debito', monto: totalNuevo, pedidoId,
        fecha: new Date(), descripcion: `Pedido editado #${pedidoId.slice(0, 8)}`, registradoPor: userId,
      })

      for (const item of newItemsRows) {
        const [latest] = await tx
          .select({ saldo: stockMovements.saldoResultante })
          .from(stockMovements)
          .where(eq(stockMovements.productoId, item.productoId))
          .orderBy(sql`${stockMovements.createdAt} DESC`)
          .limit(1)
        const saldoActual = latest?.saldo ?? 0
        await tx.insert(stockMovements).values({
          productoId: item.productoId, tipo: 'salida', cantidad: item.cantidad,
          saldoResultante: saldoActual - item.cantidad, pedidoId,
          referencia: `Pedido #${pedidoId.slice(0, 8)}`, registradoPor: userId,
        })
      }

      await recalcularPagosPedido(tx as unknown as Db, pedidoId)
    }

    return updated!
  })

  const final = await drizzleDb.query.pedidos.findFirst({ where: eq(pedidos.id, pedidoId) })
  return final ?? resultado
}

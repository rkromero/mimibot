import { eq, and, gt, isNull, sql } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { movimientosCC, pedidos, aplicacionesPago } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PedidoPendiente {
  id: string
  fecha: Date
  saldoPendiente: string // decimal as string
}

export interface AplicacionResult {
  pedidoId: string
  montoAplicado: string
  saldoRestante: string
  estadoPago: 'pagado' | 'parcial'
}

export interface DistribucionPago {
  aplicaciones: AplicacionResult[]
  sobrante: string // '0.00' if no remainder
}

export interface RegistrarPagoInput {
  clienteId: string
  monto: string
  fecha: Date
  descripcion: string | null
  registradoPor: string
}

// ─── Decimal helpers ──────────────────────────────────────────────────────────

function addDecimals(a: string, b: string): string {
  const result = parseFloat(a) + parseFloat(b)
  return Math.max(0, result).toFixed(2)
}

function subtractDecimals(a: string, b: string): string {
  const result = parseFloat(a) - parseFloat(b)
  return Math.max(0, result).toFixed(2)
}

function compareDecimals(a: string, b: string): number {
  return parseFloat(a) - parseFloat(b)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ─── Pure FIFO distribution ───────────────────────────────────────────────────

export function calcularDistribucionFIFO(
  montoPago: string,
  pedidosPendientes: PedidoPendiente[],
): DistribucionPago {
  // Sort by fecha ASC (oldest first)
  const sorted = [...pedidosPendientes].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime(),
  )

  const aplicaciones: AplicacionResult[] = []
  let montoRestante = parseFloat(montoPago).toFixed(2)

  for (const pedido of sorted) {
    if (compareDecimals(montoRestante, '0') <= 0) break

    const saldo = parseFloat(pedido.saldoPendiente).toFixed(2)
    if (compareDecimals(saldo, '0') <= 0) continue

    let montoAplicado: string
    let saldoRestante: string
    let estadoPago: 'pagado' | 'parcial'

    if (compareDecimals(montoRestante, saldo) >= 0) {
      // Enough to fully cover this pedido
      montoAplicado = saldo
      saldoRestante = '0.00'
      estadoPago = 'pagado'
      montoRestante = subtractDecimals(montoRestante, saldo)
    } else {
      // Only partially covers this pedido
      montoAplicado = montoRestante
      saldoRestante = subtractDecimals(saldo, montoRestante)
      estadoPago = 'parcial'
      montoRestante = '0.00'
    }

    aplicaciones.push({
      pedidoId: pedido.id,
      montoAplicado,
      saldoRestante,
      estadoPago,
    })
  }

  return {
    aplicaciones,
    sobrante: parseFloat(montoRestante) > 0 ? montoRestante : '0.00',
  }
}

// ─── Recalcular campos de pago desde aplicaciones vivas ──────────────────────

/**
 * Recalcula montoPagado / saldoPendiente / estadoPago para un pedido a partir
 * de la fuente de verdad: SUM(aplicaciones_pago.monto_aplicado) no borradas.
 * Debe llamarse dentro de la misma transacción después de cualquier cambio al
 * total del pedido o a sus aplicaciones.
 */
export async function recalcularPagosPedido(tx: Db, pedidoId: string): Promise<void> {
  const pedido = await tx.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoId),
    columns: { id: true, total: true },
  })
  if (!pedido) return

  const [row] = await tx
    .select({ suma: sql<string>`COALESCE(SUM(${aplicacionesPago.montoAplicado}), 0)` })
    .from(aplicacionesPago)
    .where(and(eq(aplicacionesPago.pedidoId, pedidoId), isNull(aplicacionesPago.deletedAt)))

  const pagadoReal = parseFloat(row?.suma ?? '0')
  const totalNum = parseFloat(pedido.total)
  const nuevoMontoPagado = Math.min(pagadoReal, totalNum)
  const nuevoSaldo = Math.max(0, totalNum - nuevoMontoPagado)

  await tx
    .update(pedidos)
    .set({
      montoPagado: nuevoMontoPagado.toFixed(2),
      saldoPendiente: nuevoSaldo.toFixed(2),
      estadoPago:
        nuevoMontoPagado <= 0 ? 'impago'
        : nuevoSaldo <= 0 ? 'pagado'
        : 'parcial',
    })
    .where(eq(pedidos.id, pedidoId))
}

// ─── Reconciliación FIFO de créditos a pedidos ───────────────────────────────

export interface CreditoDisponible {
  id: string
  fecha: Date
  disponible: string // decimal as string
}

export interface AplicacionReconciliacion {
  movimientoCreditoId: string
  pedidoId: string
  montoAplicado: string // decimal as string
}

/**
 * Algoritmo puro: dada una lista de créditos con saldo disponible y una lista
 * de pedidos con saldo pendiente, imputa los créditos a los pedidos del más
 * viejo al más nuevo (FIFO en ambos lados).
 *
 * Garantías:
 *   - SUM(montoAplicado) por crédito nunca supera su `disponible`.
 *   - SUM(montoAplicado) por pedido nunca supera su `saldoPendiente`.
 *   - No muta los arrays de entrada.
 *   - Idempotente respecto al estado: si no hay crédito disponible o saldo
 *     pendiente, devuelve `[]`.
 */
export function calcularReconciliacionFIFO(
  creditos: CreditoDisponible[],
  pedidosPendientes: PedidoPendiente[],
): AplicacionReconciliacion[] {
  const creds = creditos
    .map((c) => ({ id: c.id, fecha: c.fecha, disponible: round2(parseFloat(c.disponible)) }))
    .filter((c) => c.disponible > 0.0001)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  const peds = pedidosPendientes
    .map((p) => ({ id: p.id, fecha: p.fecha, saldo: round2(parseFloat(p.saldoPendiente)) }))
    .filter((p) => p.saldo > 0.0001)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  const aplicaciones: AplicacionReconciliacion[] = []
  let ci = 0 // índice del crédito disponible más antiguo no agotado

  for (const pedido of peds) {
    let saldoRestante = pedido.saldo

    while (saldoRestante > 0.0001 && ci < creds.length) {
      const credito = creds[ci]!
      if (credito.disponible <= 0.0001) {
        ci++
        continue
      }

      const aAplicar = round2(Math.min(credito.disponible, saldoRestante))
      if (aAplicar <= 0.0001) {
        ci++
        continue
      }

      aplicaciones.push({
        movimientoCreditoId: credito.id,
        pedidoId: pedido.id,
        montoAplicado: aAplicar.toFixed(2),
      })

      credito.disponible = round2(credito.disponible - aAplicar)
      saldoRestante = round2(saldoRestante - aAplicar)
    }
  }

  return aplicaciones
}

/**
 * Reconciliación completa de la cuenta corriente de un cliente dentro de una
 * transacción. Imputa todos los créditos con saldo disponible a los pedidos con
 * saldo pendiente (FIFO, más viejo primero) y recalcula `estadoPago`.
 *
 * Debe invocarse SIEMPRE dentro de la misma transacción que el cambio que la
 * dispara (registro de pago / aprobación de pedido). Es idempotente: ejecutarla
 * dos veces no duplica aplicaciones ni altera montos, porque parte siempre del
 * saldo disponible y pendiente vivo.
 *
 * Devuelve las aplicaciones insertadas (vacío si no hubo nada que imputar).
 */
export async function reconciliarCuentaCliente(
  tx: Db,
  clienteId: string,
): Promise<AplicacionReconciliacion[]> {
  // 1. Créditos vivos con sus aplicaciones vivas → saldo disponible
  const creditos = await tx.query.movimientosCC.findMany({
    where: and(
      eq(movimientosCC.clienteId, clienteId),
      eq(movimientosCC.tipo, 'credito'),
      isNull(movimientosCC.deletedAt),
    ),
    columns: { id: true, monto: true, fecha: true },
    with: {
      aplicaciones: {
        columns: { montoAplicado: true },
        where: (a, ops) => ops.isNull(a.deletedAt),
      },
    },
    orderBy: (m, { asc }) => [asc(m.fecha)],
  })

  const creditosDisponibles: CreditoDisponible[] = []
  for (const credito of creditos) {
    const aplicado = (credito.aplicaciones ?? []).reduce(
      (sum, a) => sum + parseFloat(a.montoAplicado),
      0,
    )
    const disponible = round2(parseFloat(credito.monto) - aplicado)
    if (disponible > 0.0001) {
      creditosDisponibles.push({
        id: credito.id,
        fecha: credito.fecha,
        disponible: disponible.toFixed(2),
      })
    }
  }

  if (creditosDisponibles.length === 0) return []

  // 2. Pedidos con saldo pendiente, del más viejo al más nuevo
  const pedidosPendientesRows = await tx.query.pedidos.findMany({
    where: and(
      eq(pedidos.clienteId, clienteId),
      gt(pedidos.saldoPendiente, '0'),
      isNull(pedidos.deletedAt),
    ),
    columns: { id: true, fecha: true, saldoPendiente: true },
    orderBy: (p, { asc }) => [asc(p.fecha)],
  })

  if (pedidosPendientesRows.length === 0) return []

  // 3. FIFO puro
  const aplicaciones = calcularReconciliacionFIFO(
    creditosDisponibles,
    pedidosPendientesRows.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      saldoPendiente: p.saldoPendiente,
    })),
  )

  if (aplicaciones.length === 0) return []

  // 4. Persistir aplicaciones y recalcular cada pedido afectado
  const pedidosAfectados = new Set<string>()
  for (const ap of aplicaciones) {
    await tx.insert(aplicacionesPago).values({
      movimientoCreditoId: ap.movimientoCreditoId,
      pedidoId: ap.pedidoId,
      montoAplicado: ap.montoAplicado,
    })
    pedidosAfectados.add(ap.pedidoId)
  }

  for (const pedidoId of pedidosAfectados) {
    await recalcularPagosPedido(tx, pedidoId)
  }

  return aplicaciones
}

// ─── Register payment (DB transaction) ───────────────────────────────────────

export async function registrarPago(
  input: RegistrarPagoInput,
  drizzleDb: Db = db,
): Promise<{
  movimiento: typeof movimientosCC.$inferSelect
  distribucion: DistribucionPago
}> {
  const { clienteId, monto, fecha, descripcion, registradoPor } = input

  return drizzleDb.transaction(async (tx) => {
    // 1. Insert movimientosCC tipo='credito'
    const [movimiento] = await tx
      .insert(movimientosCC)
      .values({
        clienteId,
        tipo: 'credito',
        monto,
        pedidoId: null,
        fecha,
        descripcion,
        registradoPor,
      })
      .returning()

    // 2. Reconciliar toda la cuenta del cliente (FIFO, más viejo primero).
    //    Imputa este crédito y cualquier otro saldo a favor previo a los
    //    pedidos con saldo pendiente, dentro de la misma transacción.
    const aplicacionesCreadas = await reconciliarCuentaCliente(
      tx as unknown as Db,
      clienteId,
    )

    // 3. Construir la distribución correspondiente a ESTE crédito para la UI.
    //    `sobrante` = parte de este pago que quedó como saldo a favor.
    const deEstePago = aplicacionesCreadas.filter(
      (a) => a.movimientoCreditoId === movimiento!.id,
    )

    const aplicaciones: AplicacionResult[] = []
    let aplicadoEstePago = 0
    for (const ap of deEstePago) {
      const pedidoActual = await tx.query.pedidos.findFirst({
        where: eq(pedidos.id, ap.pedidoId),
        columns: { saldoPendiente: true, estadoPago: true },
      })
      aplicadoEstePago += parseFloat(ap.montoAplicado)
      aplicaciones.push({
        pedidoId: ap.pedidoId,
        montoAplicado: ap.montoAplicado,
        saldoRestante: pedidoActual?.saldoPendiente ?? '0.00',
        estadoPago: pedidoActual?.estadoPago === 'pagado' ? 'pagado' : 'parcial',
      })
    }

    const sobrante = Math.max(0, parseFloat(monto) - aplicadoEstePago).toFixed(2)
    const distribucion: DistribucionPago = { aplicaciones, sobrante }

    return { movimiento: movimiento!, distribucion }
  })
}

// ─── Register payment for a specific pedido ──────────────────────────────────

export interface RegistrarPagoPedidoInput {
  pedidoId: string
  monto: string
  metodoPago: 'efectivo' | 'transferencia' | 'mercadopago'
  registradoPor: string
}

export async function registrarPagoPedido(
  input: RegistrarPagoPedidoInput,
  drizzleDb: Db = db,
): Promise<{
  movimiento: typeof movimientosCC.$inferSelect
  pedidoActualizado: Pick<typeof pedidos.$inferSelect, 'id' | 'montoPagado' | 'saldoPendiente' | 'estadoPago'>
  sobrante: string
}> {
  const { pedidoId, monto, metodoPago, registradoPor } = input

  return drizzleDb.transaction(async (tx) => {
    // 1. Fetch the pedido
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      columns: { id: true, clienteId: true, total: true, montoPagado: true, saldoPendiente: true },
    })
    if (!pedido) throw new Error('Pedido no encontrado')

    // 2. Insert movimientos_cc tipo='credito' linked to this pedido
    const [movimiento] = await tx
      .insert(movimientosCC)
      .values({
        clienteId: pedido.clienteId,
        tipo: 'credito',
        monto,
        pedidoId,
        fecha: new Date(),
        descripcion: null,
        metodoPago,
        registradoPor,
      })
      .returning()

    // 3. Compute aplicado = min(monto, saldoPendiente); sobrante stays as credit
    const montoNum = parseFloat(monto)
    const saldoNum = parseFloat(pedido.saldoPendiente)
    const aplicadoNum = Math.min(montoNum, saldoNum)
    const aplicado = aplicadoNum.toFixed(2)
    const sobrante = Math.max(0, montoNum - aplicadoNum).toFixed(2)

    // 4. Only insert aplicacion and update pedido when there's something to apply
    if (aplicadoNum > 0) {
      await tx.insert(aplicacionesPago).values({
        movimientoCreditoId: movimiento!.id,
        pedidoId,
        montoAplicado: aplicado,
      })

      const nuevoMontoPagado = addDecimals(pedido.montoPagado, aplicado)
      const nuevoSaldo = subtractDecimals(pedido.total, nuevoMontoPagado)
      const nuevoEstadoPago: 'pagado' | 'parcial' =
        compareDecimals(nuevoSaldo, '0') <= 0 ? 'pagado' : 'parcial'

      const [actualizado] = await tx
        .update(pedidos)
        .set({
          montoPagado: nuevoMontoPagado,
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
          pagoCobradoPor: registradoPor,
          pagoCobradoAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pedidos.id, pedidoId))
        .returning({
          id: pedidos.id,
          montoPagado: pedidos.montoPagado,
          saldoPendiente: pedidos.saldoPendiente,
          estadoPago: pedidos.estadoPago,
        })

      return { movimiento: movimiento!, pedidoActualizado: actualizado!, sobrante }
    }

    // Pedido already fully paid — entire monto is sobrante
    const noop = {
      id: pedido.id,
      montoPagado: pedido.montoPagado,
      saldoPendiente: pedido.saldoPendiente,
      estadoPago: 'pagado' as const,
    }
    return { movimiento: movimiento!, pedidoActualizado: noop, sobrante }
  })
}

// ─── Apply existing saldo a favor to a cliente's pending pedidos ─────────────

/**
 * Aplica el saldo a favor (créditos sin imputar) del cliente a sus pedidos con
 * saldo pendiente. Delega en `reconciliarCuentaCliente`, por lo que respeta el
 * orden FIFO, filtra créditos/aplicaciones borrados y es idempotente.
 *
 * `pedidoId` se mantiene por compatibilidad con los llamadores; la
 * reconciliación abarca toda la cuenta del cliente (que incluye ese pedido).
 */
export async function aplicarSaldoAFavorAPedido(
  clienteId: string,
  _pedidoId: string,
  drizzleDb: Db = db,
  _userId?: string,
): Promise<void> {
  await drizzleDb.transaction(async (tx) => {
    await reconciliarCuentaCliente(tx as unknown as Db, clienteId)
  })
}

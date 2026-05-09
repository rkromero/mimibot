import { eq, and, gt } from 'drizzle-orm'
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

    // 2. Fetch pedidos with saldoPendiente > 0 ordered by fecha ASC
    const pedidosPendientesRows = await tx.query.pedidos.findMany({
      where: and(
        eq(pedidos.clienteId, clienteId),
        gt(pedidos.saldoPendiente, '0'),
      ),
      columns: { id: true, fecha: true, saldoPendiente: true },
      orderBy: (p, { asc }) => [asc(p.fecha)],
    })

    const pedidosPendientes: PedidoPendiente[] = pedidosPendientesRows.map(
      (p) => ({
        id: p.id,
        fecha: p.fecha,
        saldoPendiente: p.saldoPendiente,
      }),
    )

    // 3. Calculate FIFO distribution
    const distribucion = calcularDistribucionFIFO(monto, pedidosPendientes)

    // 4. Apply each distribution entry
    for (const aplicacion of distribucion.aplicaciones) {
      // Insert aplicaciones_pago record
      await tx.insert(aplicacionesPago).values({
        movimientoCreditoId: movimiento!.id,
        pedidoId: aplicacion.pedidoId,
        montoAplicado: aplicacion.montoAplicado,
      })

      // Fetch current pedido to update montoPagado
      const pedidoActual = await tx.query.pedidos.findFirst({
        where: eq(pedidos.id, aplicacion.pedidoId),
        columns: { montoPagado: true, total: true },
      })

      if (pedidoActual) {
        const nuevoMontoPagado = addDecimals(
          pedidoActual.montoPagado,
          aplicacion.montoAplicado,
        )
        const nuevoSaldo = subtractDecimals(
          pedidoActual.total,
          nuevoMontoPagado,
        )

        await tx
          .update(pedidos)
          .set({
            montoPagado: nuevoMontoPagado,
            saldoPendiente: nuevoSaldo,
            estadoPago: aplicacion.estadoPago,
            updatedAt: new Date(),
          })
          .where(eq(pedidos.id, aplicacion.pedidoId))
      }
    }

    return { movimiento: movimiento!, distribucion }
  })
}

// ─── Apply existing saldo a favor to a specific new pedido ───────────────────

export async function aplicarSaldoAFavorAPedido(
  clienteId: string,
  pedidoId: string,
  drizzleDb: Db = db,
  _userId?: string,
): Promise<void> {
  await drizzleDb.transaction(async (tx) => {
    // Fetch the target pedido
    const pedido = await tx.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      columns: {
        id: true,
        fecha: true,
        saldoPendiente: true,
        total: true,
        montoPagado: true,
      },
    })

    if (!pedido || parseFloat(pedido.saldoPendiente) <= 0) return

    // Find all credit movimientos for this cliente
    const creditos = await tx.query.movimientosCC.findMany({
      where: and(
        eq(movimientosCC.clienteId, clienteId),
        eq(movimientosCC.tipo, 'credito'),
      ),
      columns: { id: true, monto: true },
      with: {
        aplicaciones: {
          columns: { montoAplicado: true },
        },
      },
    })

    // Build list of creditos that still have available balance
    const creditosDisponibles: Array<{
      id: string
      montoDisponible: string
    }> = []

    for (const credito of creditos) {
      const totalAplicado = (credito.aplicaciones ?? []).reduce(
        (sum, a) => sum + parseFloat(a.montoAplicado),
        0,
      )
      const disponible = parseFloat(credito.monto) - totalAplicado
      if (disponible > 0.001) {
        creditosDisponibles.push({
          id: credito.id,
          montoDisponible: disponible.toFixed(2),
        })
      }
    }

    if (creditosDisponibles.length === 0) return

    let saldoPedidoRestante = parseFloat(pedido.saldoPendiente)
    let nuevoMontoPagado = parseFloat(pedido.montoPagado)

    for (const credito of creditosDisponibles) {
      if (saldoPedidoRestante <= 0) break

      const disponible = parseFloat(credito.montoDisponible)
      const aAplicar = Math.min(disponible, saldoPedidoRestante)

      await tx.insert(aplicacionesPago).values({
        movimientoCreditoId: credito.id,
        pedidoId,
        montoAplicado: aAplicar.toFixed(2),
      })

      saldoPedidoRestante -= aAplicar
      nuevoMontoPagado += aAplicar
    }

    const nuevoSaldo = Math.max(0, saldoPedidoRestante)
    let estadoPago: 'impago' | 'parcial' | 'pagado'
    if (nuevoMontoPagado <= 0) {
      estadoPago = 'impago'
    } else if (nuevoSaldo <= 0.001) {
      estadoPago = 'pagado'
    } else {
      estadoPago = 'parcial'
    }

    await tx
      .update(pedidos)
      .set({
        montoPagado: nuevoMontoPagado.toFixed(2),
        saldoPendiente: nuevoSaldo.toFixed(2),
        estadoPago,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, pedidoId))
  })
}

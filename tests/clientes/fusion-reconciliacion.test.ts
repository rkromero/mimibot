/**
 * Test de integración fusión + reconciliación de cuenta corriente
 * (lib/clientes/fusion.service.ts + lib/cuenta-corriente/pago.service.ts).
 *
 * Escenario del bug: cliente A (base) con un pedido con saldoPendiente 168000;
 * cliente B (duplicado) con un crédito disponible de 168000 sin imputar.
 * Antes del fix, fusionarClientes(A, B) repuntaba las filas pero no imputaba
 * el crédito: saldo CC $0,00 con el pedido "parcial"/"impago".
 *
 * Tras el fix, la fusión reconcilia dentro de la misma transacción:
 *   - el pedido queda estadoPago 'pagado' y saldoPendiente '0.00'
 *   - existe la aplicación crédito → pedido por 168000
 *   - el resumen reporta aplicacionesCreadas
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  pedidos as pedidosTable,
  movimientosCC as movimientosTable,
} from '@/db/schema'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    update: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    query: {
      conversations: { findFirst: vi.fn() },
      movimientosCC: { findMany: vi.fn() },
      pedidos: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  }
  const mockDb = {
    query: { clientes: { findFirst: vi.fn() } },
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }
  return { mockDb, mockTx }
})

vi.mock('@/db', () => ({ db: mockDb }))

// ─── Estado mutable de la "base" ──────────────────────────────────────────────

const TARGET_ID = '11111111-1111-4111-8111-111111111111' // cliente A (base)
const SOURCE_ID = '22222222-2222-4222-8222-222222222222' // cliente B (duplicado)

type Estado = {
  creditos: Array<{ id: string; clienteId: string; monto: string; fecha: Date }>
  pedido: {
    id: string
    clienteId: string
    total: string
    fecha: Date
    saldoPendiente: string
    montoPagado: string
    estadoPago: string
  }
  aplicaciones: Array<{ movimientoCreditoId: string; pedidoId: string; montoAplicado: string }>
}

function nuevoEstado(): Estado {
  return {
    // Crédito de B: $168000 sin ninguna aplicación (disponible completo)
    creditos: [
      { id: 'cr-b', clienteId: SOURCE_ID, monto: '168000.00', fecha: new Date('2026-05-01') },
    ],
    // Pedido de A: $168000 enteramente pendiente
    pedido: {
      id: 'pd-a',
      clienteId: TARGET_ID,
      total: '168000.00',
      fecha: new Date('2026-06-01'),
      saldoPendiente: '168000.00',
      montoPagado: '0.00',
      estadoPago: 'impago',
    },
    aplicaciones: [],
  }
}

// Cablea mockTx contra el estado: los update repuntan/mutan, las query leen el
// estado vivo (los créditos solo se ven en la reconciliación si el repunte de
// movimientosCC efectivamente los pasó al target).
function wireTx(estado: Estado) {
  mockTx.update.mockImplementation((table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        let rows: Array<{ id: string }> = []
        if (table === movimientosTable && 'clienteId' in values) {
          const movidos = estado.creditos.filter((c) => c.clienteId === SOURCE_ID)
          for (const c of movidos) c.clienteId = values['clienteId'] as string
          rows = movidos.map((c) => ({ id: c.id }))
        } else if (table === pedidosTable && 'clienteId' in values) {
          // Repunte de pedidos del source: A ya es dueño del pedido → nada que mover
          rows = estado.pedido.clienteId === SOURCE_ID ? [{ id: estado.pedido.id }] : []
        } else if (table === pedidosTable) {
          // recalcularPagosPedido actualizando montos del único pedido
          if (values['montoPagado'] !== undefined) estado.pedido.montoPagado = values['montoPagado'] as string
          if (values['saldoPendiente'] !== undefined) estado.pedido.saldoPendiente = values['saldoPendiente'] as string
          if (values['estadoPago'] !== undefined) estado.pedido.estadoPago = values['estadoPago'] as string
        }
        return Object.assign(Promise.resolve(rows), {
          returning: () => Promise.resolve(rows),
        })
      },
    }),
  }))

  mockTx.query.conversations.findFirst.mockResolvedValue(undefined)

  mockTx.query.movimientosCC.findMany.mockImplementation(async () =>
    estado.creditos
      .filter((c) => c.clienteId === TARGET_ID)
      .map((c) => ({
        id: c.id,
        monto: c.monto,
        fecha: c.fecha,
        aplicaciones: estado.aplicaciones
          .filter((a) => a.movimientoCreditoId === c.id)
          .map((a) => ({ montoAplicado: a.montoAplicado })),
      })),
  )

  mockTx.query.pedidos.findMany.mockImplementation(async () =>
    estado.pedido.clienteId === TARGET_ID && parseFloat(estado.pedido.saldoPendiente) > 0
      ? [{ id: estado.pedido.id, fecha: estado.pedido.fecha, saldoPendiente: estado.pedido.saldoPendiente }]
      : [],
  )

  mockTx.query.pedidos.findFirst.mockImplementation(async () => ({
    id: estado.pedido.id,
    total: estado.pedido.total,
  }))

  mockTx.insert.mockImplementation(() => ({
    values: async (v: Estado['aplicaciones'][number]) => {
      estado.aplicaciones.push(v)
    },
  }))

  // SUM(aplicaciones vivas) del pedido, para recalcularPagosPedido
  mockTx.select.mockImplementation(() => ({
    from: () => ({
      where: async () => {
        const suma = estado.aplicaciones
          .filter((a) => a.pedidoId === estado.pedido.id)
          .reduce((s, a) => s + parseFloat(a.montoAplicado), 0)
        return [{ suma: suma.toFixed(2) }]
      },
    }),
  }))
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('fusionarClientes + reconciliación CC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('imputa el crédito del duplicado al pedido pendiente de la base y lo deja pagado', async () => {
    const estado = nuevoEstado()
    wireTx(estado)
    mockDb.query.clientes.findFirst
      .mockResolvedValueOnce({ id: TARGET_ID, leadId: null }) // target A
      .mockResolvedValueOnce({ id: SOURCE_ID, leadId: null }) // source B

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    // El crédito de B se repuntó y se imputó al pedido de A
    expect(resumen.movimientosCC).toBe(1)
    expect(resumen.aplicacionesCreadas).toBe(1)
    expect(estado.aplicaciones).toEqual([
      { movimientoCreditoId: 'cr-b', pedidoId: 'pd-a', montoAplicado: '168000.00' },
    ])

    // El pedido quedó saldado
    expect(estado.pedido).toMatchObject({
      estadoPago: 'pagado',
      saldoPendiente: '0.00',
      montoPagado: '168000.00',
    })
  })

  it('sin crédito repuntado no habría imputación (control: el fix depende del repunte)', async () => {
    const estado = nuevoEstado()
    estado.creditos = [] // B sin créditos
    wireTx(estado)
    mockDb.query.clientes.findFirst
      .mockResolvedValueOnce({ id: TARGET_ID, leadId: null })
      .mockResolvedValueOnce({ id: SOURCE_ID, leadId: null })

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    expect(resumen.aplicacionesCreadas).toBe(0)
    expect(estado.aplicaciones).toEqual([])
    expect(estado.pedido).toMatchObject({
      estadoPago: 'impago',
      saldoPendiente: '168000.00',
    })
  })
})

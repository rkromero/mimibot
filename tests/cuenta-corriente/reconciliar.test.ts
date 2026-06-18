import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))

import {
  calcularReconciliacionFIFO,
  reconciliarCuentaCliente,
  type CreditoDisponible,
  type AplicacionReconciliacion,
} from '@/lib/cuenta-corriente/pago.service'
import type { PedidoPendiente } from '@/lib/cuenta-corriente/pago.service'
import type { Db } from '@/db'

const d = (s: string) => new Date(s)

// ─── calcularReconciliacionFIFO (función pura) ────────────────────────────────

describe('calcularReconciliacionFIFO', () => {
  it('crédito antes del pedido: imputa el crédito completo al pedido (caso Sergio Pereyra)', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '1000.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'pd1', fecha: d('2024-02-01'), saldoPendiente: '1000.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'pd1', montoAplicado: '1000.00' },
    ])
  })

  it('FIFO de pedidos: un crédito cubre el pedido más viejo y el sobrante pasa al siguiente', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '700.00' },
    ]
    // Pasados en orden inverso a propósito; el algoritmo debe ordenar por fecha
    const pedidos: PedidoPendiente[] = [
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '400.00' },
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '500.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'p1', montoAplicado: '500.00' },
      { movimientoCreditoId: 'cr1', pedidoId: 'p2', montoAplicado: '200.00' },
    ])
  })

  it('FIFO de créditos: consume los créditos más antiguos primero', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr2', fecha: d('2024-03-01'), disponible: '400.00' },
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '300.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p1', fecha: d('2024-02-01'), saldoPendiente: '600.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'p1', montoAplicado: '300.00' },
      { movimientoCreditoId: 'cr2', pedidoId: 'p1', montoAplicado: '300.00' },
    ])
  })

  it('crédito parcial: el pedido más viejo se cubre primero, el sobrante pasa al siguiente', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '600.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p3', fecha: d('2024-03-01'), saldoPendiente: '500.00' },
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '200.00' },
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '350.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    // 600 = 200 (p1) + 350 (p2) + 50 (p3)
    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'p1', montoAplicado: '200.00' },
      { movimientoCreditoId: 'cr1', pedidoId: 'p2', montoAplicado: '350.00' },
      { movimientoCreditoId: 'cr1', pedidoId: 'p3', montoAplicado: '50.00' },
    ])
  })

  it('crédito < saldo total: el pedido más viejo queda parcial, el resto sin imputar (impago)', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '150.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '200.00' },
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '300.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    // Solo p1 recibe imputación (parcial); p2 no aparece → sigue impago
    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'p1', montoAplicado: '150.00' },
    ])
  })

  it('no aplica más que el saldo del pedido aunque sobre crédito', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '1000.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '300.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'p1', montoAplicado: '300.00' },
    ])
  })

  it('invariantes: SUM por crédito ≤ monto y SUM por pedido ≤ saldo', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '250.00' },
      { id: 'cr2', fecha: d('2024-02-01'), disponible: '400.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p1', fecha: d('2024-01-15'), saldoPendiente: '300.00' },
      { id: 'p2', fecha: d('2024-02-15'), saldoPendiente: '500.00' },
    ]

    const result = calcularReconciliacionFIFO(creditos, pedidos)

    const sumBy = (rows: AplicacionReconciliacion[], key: 'movimientoCreditoId' | 'pedidoId') => {
      const m = new Map<string, number>()
      for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + parseFloat(r.montoAplicado))
      return m
    }

    const porCredito = sumBy(result, 'movimientoCreditoId')
    expect(porCredito.get('cr1')! <= 250).toBe(true)
    expect(porCredito.get('cr2')! <= 400).toBe(true)

    const porPedido = sumBy(result, 'pedidoId')
    expect(porPedido.get('p1')! <= 300).toBe(true)
    expect((porPedido.get('p2') ?? 0) <= 500).toBe(true)

    // 650 de crédito cubre p1 (300) entero y 350 de p2
    expect(porPedido.get('p1')).toBe(300)
    expect(porPedido.get('p2')).toBe(350)
  })

  it('idempotente a nivel algoritmo: sin disponible o sin saldo devuelve []', () => {
    expect(
      calcularReconciliacionFIFO(
        [{ id: 'cr1', fecha: d('2024-01-01'), disponible: '0.00' }],
        [{ id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '100.00' }],
      ),
    ).toEqual([])

    expect(
      calcularReconciliacionFIFO(
        [{ id: 'cr1', fecha: d('2024-01-01'), disponible: '100.00' }],
        [{ id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '0.00' }],
      ),
    ).toEqual([])

    expect(calcularReconciliacionFIFO([], [])).toEqual([])
  })

  it('no muta los arrays de entrada', () => {
    const creditos: CreditoDisponible[] = [
      { id: 'cr1', fecha: d('2024-01-01'), disponible: '500.00' },
    ]
    const pedidos: PedidoPendiente[] = [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '300.00' },
    ]
    const creditosCopia = creditos.map((c) => ({ ...c }))
    const pedidosCopia = pedidos.map((p) => ({ ...p }))

    calcularReconciliacionFIFO(creditos, pedidos)

    expect(creditos).toEqual(creditosCopia)
    expect(pedidos).toEqual(pedidosCopia)
  })
})

// ─── reconciliarCuentaCliente (orquestación con tx falso) ────────────────────

interface FakeState {
  creditos: Array<{ id: string; monto: string; fecha: Date; aplicacionesIniciales: number[] }>
  pedido: {
    id: string
    total: string
    fecha: Date
    saldoPendiente: string
    montoPagado: string
    estadoPago: string
  }
  inserted: AplicacionReconciliacion[]
  updates: Array<Record<string, unknown>>
}

/**
 * tx falso con estado mutable: un solo pedido + N créditos. Modela las queries
 * relacionales y los efectos de recalcularPagosPedido para verificar el cableado
 * completo de reconciliarCuentaCliente (incluyendo idempotencia).
 */
function makeFakeTx(state: FakeState): Db {
  const tx = {
    query: {
      movimientosCC: {
        findMany: vi.fn(async () =>
          state.creditos.map((c) => ({
            id: c.id,
            monto: c.monto,
            fecha: c.fecha,
            aplicaciones: [
              ...c.aplicacionesIniciales.map((m) => ({ montoAplicado: m.toFixed(2) })),
              ...state.inserted
                .filter((a) => a.movimientoCreditoId === c.id)
                .map((a) => ({ montoAplicado: a.montoAplicado })),
            ],
          })),
        ),
      },
      pedidos: {
        findMany: vi.fn(async () =>
          parseFloat(state.pedido.saldoPendiente) > 0
            ? [{ id: state.pedido.id, fecha: state.pedido.fecha, saldoPendiente: state.pedido.saldoPendiente }]
            : [],
        ),
        findFirst: vi.fn(async () => ({ id: state.pedido.id, total: state.pedido.total })),
      },
    },
    insert: vi.fn(() => ({
      values: async (v: AplicacionReconciliacion) => {
        state.inserted.push(v)
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: async () => {
          const suma = state.inserted
            .filter((a) => a.pedidoId === state.pedido.id)
            .reduce((s, a) => s + parseFloat(a.montoAplicado), 0)
          return [{ suma: suma.toFixed(2) }]
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (o: Record<string, unknown>) => {
        state.updates.push(o)
        if (o['saldoPendiente'] !== undefined) state.pedido.saldoPendiente = o['saldoPendiente'] as string
        if (o['montoPagado'] !== undefined) state.pedido.montoPagado = o['montoPagado'] as string
        if (o['estadoPago'] !== undefined) state.pedido.estadoPago = o['estadoPago'] as string
        return { where: async () => {} }
      },
    })),
  }
  return tx as unknown as Db
}

function nuevoEstadoSergio(): FakeState {
  return {
    creditos: [{ id: 'cr1', monto: '1000.00', fecha: new Date('2024-01-01'), aplicacionesIniciales: [] }],
    pedido: {
      id: 'pd1',
      total: '1000.00',
      fecha: new Date('2024-02-01'),
      saldoPendiente: '1000.00',
      montoPagado: '0.00',
      estadoPago: 'impago',
    },
    inserted: [],
    updates: [],
  }
}

describe('reconciliarCuentaCliente', () => {
  it('crédito antes del pedido: imputa el crédito y deja el pedido pagado (caso Sergio Pereyra)', async () => {
    const state = nuevoEstadoSergio()
    const tx = makeFakeTx(state)

    const result = await reconciliarCuentaCliente(tx, 'cli1')

    expect(result).toEqual([
      { movimientoCreditoId: 'cr1', pedidoId: 'pd1', montoAplicado: '1000.00' },
    ])
    expect(state.inserted).toHaveLength(1)
    expect(state.pedido).toMatchObject({
      saldoPendiente: '0.00',
      montoPagado: '1000.00',
      estadoPago: 'pagado',
    })
  })

  it('idempotente: una segunda corrida no inserta aplicaciones ni altera montos', async () => {
    const state = nuevoEstadoSergio()
    const tx = makeFakeTx(state)

    await reconciliarCuentaCliente(tx, 'cli1')
    const insertedTrasPrimera = state.inserted.length
    const saldoTrasPrimera = state.pedido.saldoPendiente

    const result2 = await reconciliarCuentaCliente(tx, 'cli1')

    expect(result2).toEqual([])
    expect(state.inserted).toHaveLength(insertedTrasPrimera)
    expect(state.pedido.saldoPendiente).toBe(saldoTrasPrimera)
  })

  it('sin crédito disponible (ya imputado): no hace nada', async () => {
    const state: FakeState = {
      creditos: [{ id: 'cr1', monto: '1000.00', fecha: new Date('2024-01-01'), aplicacionesIniciales: [1000] }],
      pedido: {
        id: 'pd1', total: '500.00', fecha: new Date('2024-02-01'),
        saldoPendiente: '500.00', montoPagado: '0.00', estadoPago: 'impago',
      },
      inserted: [],
      updates: [],
    }
    const tx = makeFakeTx(state)

    const result = await reconciliarCuentaCliente(tx, 'cli1')

    expect(result).toEqual([])
    expect(state.inserted).toHaveLength(0)
  })

  it('sin pedido con saldo: no hace nada', async () => {
    const state: FakeState = {
      creditos: [{ id: 'cr1', monto: '1000.00', fecha: new Date('2024-01-01'), aplicacionesIniciales: [] }],
      pedido: {
        id: 'pd1', total: '500.00', fecha: new Date('2024-02-01'),
        saldoPendiente: '0.00', montoPagado: '500.00', estadoPago: 'pagado',
      },
      inserted: [],
      updates: [],
    }
    const tx = makeFakeTx(state)

    const result = await reconciliarCuentaCliente(tx, 'cli1')

    expect(result).toEqual([])
    expect(state.inserted).toHaveLength(0)
  })
})

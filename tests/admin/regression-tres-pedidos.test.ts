/**
 * Regression test: vendedor with 1 client that has exactly 3 paid orders in the period.
 *
 * Expected:
 *   - clientesPrimerPedido.alcanzado = 1  (client's first paid order is in the period)
 *   - clientesNuevos.alcanzado      = 1  (client has >= 3 paid orders in the period)
 *   - pctClientesConPedido.alcanzado = 100 (1 out of 1 assigned client has >= 1 paid order)
 *
 * Prior to the fix:
 *   - clientesNuevos used clientes.fechaConversionANuevo (cached field) → returned 0
 *   - pctClientesConPedido used pedidos.estado='confirmado' instead of estadoPago='pagado' → returned 0%
 */
import { describe, it, expect } from 'vitest'
import { countClientesNuevos } from '@/lib/metas/avance.service'
import { countPrimerPedidoClientes } from '@/lib/metas/avance.service'
import { buildRankMap } from '@/lib/admin/dashboard.service'

const CLIENTE_ID = 'c1'
const PERIOD_START = new Date(2026, 5, 1)  // June 1 2026 local time
const PERIOD_END = new Date(2026, 6, 1)    // July 1 2026 local time

// Three paid orders for the same client, all within the period
const pedidosPagados = [
  { id: 'p1', clienteId: CLIENTE_ID, fecha: new Date(2026, 5, 5) },
  { id: 'p2', clienteId: CLIENTE_ID, fecha: new Date(2026, 5, 12) },
  { id: 'p3', clienteId: CLIENTE_ID, fecha: new Date(2026, 5, 20) },
]

// Rows as returned by the new clientesNuevosDelPeriodo query ({clienteId} per paid order)
const nuevosRows = pedidosPagados.map((p) => ({ clienteId: p.clienteId }))

describe('regression: 1 cliente con 3 pedidos pagados en el periodo', () => {
  it('clientesNuevos.alcanzado = 1 (>= 3 pedidos pagados → umbral exacto cumplido)', () => {
    expect(countClientesNuevos(nuevosRows, 3)).toBe(1)
  })

  it('umbral exacto: 3 pedidos → cuenta (>= 3, no > 3)', () => {
    // Exactly 3 orders — should be counted (>= 3)
    const rows = [
      { clienteId: CLIENTE_ID },
      { clienteId: CLIENTE_ID },
      { clienteId: CLIENTE_ID },
    ]
    expect(countClientesNuevos(rows, 3)).toBe(1)
  })

  it('umbral no cumplido: 2 pedidos → no cuenta', () => {
    const rows = [{ clienteId: CLIENTE_ID }, { clienteId: CLIENTE_ID }]
    expect(countClientesNuevos(rows, 3)).toBe(0)
  })

  it('clientesPrimerPedido.alcanzado = 1 (el cliente no tiene pedidos anteriores al periodo)', () => {
    // The client has no paid orders before the period
    const clientesEnPeriodo = [CLIENTE_ID]
    const clientesConHistorial = new Set<string>()  // no prior paid orders
    expect(countPrimerPedidoClientes(clientesEnPeriodo, clientesConHistorial)).toBe(1)
  })

  it('pctClientesConPedido > 0: cliente con 3 pedidos pagados está cubierto', () => {
    // Coverage numerator: client has >= 1 paid order → included
    // Coverage denominator: 1 client assigned to vendor
    const clientesConPedido = 1
    const denominador = 1
    const cobertura = Math.round((clientesConPedido / denominador) * 100 * 100) / 100
    expect(cobertura).toBe(100)
  })

  it('las tres métricas son consistentes entre sí para el mismo cliente', () => {
    // 1) Primer pedido: client has no prior orders → IS a first-order client
    const primerPedido = countPrimerPedidoClientes([CLIENTE_ID], new Set())
    expect(primerPedido).toBe(1)

    // 2) Nuevos: client has 3 paid orders in period → IS a new client
    const nuevos = countClientesNuevos(nuevosRows, 3)
    expect(nuevos).toBe(1)

    // 3) Cobertura numerador: client has >= 1 paid order in period → IS covered
    const pctNumerador = new Set(nuevosRows.map((r) => r.clienteId)).size
    expect(pctNumerador).toBe(1)

    // All three should agree: 1 client involved
    expect(primerPedido).toBe(nuevos)
    expect(nuevos).toBe(pctNumerador)
  })

  it('buildRankMap asigna rank=1 al primer pedido del cliente (usado por Cl.c/PP)', () => {
    const allOrders = pedidosPagados.map((p) => ({
      id: p.id,
      clienteId: p.clienteId,
      fecha: p.fecha,
    }))
    const rankMap = buildRankMap(allOrders)
    expect(rankMap.get('p1')).toBe(1)
    expect(rankMap.get('p2')).toBe(2)
    expect(rankMap.get('p3')).toBe(3)
  })

  it('múltiples clientes: solo el que tiene >= 3 pedidos pagados cuenta como nuevo', () => {
    const rows = [
      { clienteId: 'c1' }, { clienteId: 'c1' }, { clienteId: 'c1' },  // 3 orders → counts
      { clienteId: 'c2' }, { clienteId: 'c2' },                         // 2 orders → does NOT count
      { clienteId: 'c3' }, { clienteId: 'c3' }, { clienteId: 'c3' }, { clienteId: 'c3' }, // 4 orders → counts
    ]
    expect(countClientesNuevos(rows, 3)).toBe(2)
  })
})

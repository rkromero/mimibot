import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockExecute, mockUpdate, mockBusinessConfigFindFirst } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockUpdate: vi.fn(),
  mockBusinessConfigFindFirst: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    execute: mockExecute,
    update: mockUpdate,
    query: { businessConfig: { findFirst: mockBusinessConfigFindFirst } },
  },
}))

vi.mock('@/db/schema', () => ({
  businessConfig: { id: 'bc.id' },
  clientes: {
    id: 'c.id', deletedAt: 'c.deleted_at', estadoActividad: 'c.estado_actividad',
    fechaConversionANuevo: 'c.fecha_conversion_a_nuevo', vendedorConversionId: 'c.vendedor_conversion_id',
    updatedAt: 'c.updated_at', asignadoA: 'c.asignado_a',
  },
  pedidos: {
    clienteId: 'p.cliente_id', estado: 'p.estado', estadoPago: 'p.estado_pago',
    deletedAt: 'p.deleted_at', fecha: 'p.fecha', total: 'p.total',
  },
}))

import { recalcularEstadosActividad, recalcularClientesNuevos } from '@/lib/clientes/actividad.service'

const DEFAULT_CONFIG = {
  id: 1,
  clienteNuevoMinPedidos: 3,
  clienteNuevoVentanaDias: 90,
  clienteNuevoMontoMinimo: null,
  clienteActivoDias: 60,
  clienteInactivoDias: 90,
  clientePerdidoDias: 180,
  clienteMorosoDias: 30,
  alertaLeadHoras: 24,
  alertaMetaDia: 20,
  alertaMetaPct: '0.50',
  updatedBy: null,
  updatedAt: new Date(),
}

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}

function makeUpdateChain() {
  const whereUpdate = vi.fn().mockResolvedValue(undefined)
  const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
  mockUpdate.mockReturnValue({ set: setUpdate })
  return { setUpdate, whereUpdate }
}

// ─── recalcularEstadosActividad ───────────────────────────────────────────────

describe('recalcularEstadosActividad — una sola query en vez de N+1', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('llama a db.execute exactamente una vez (no N queries por cliente)', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    // Simulate RETURNING 3 updated rows
    mockExecute.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }])

    const { updated } = await recalcularEstadosActividad()

    expect(mockExecute).toHaveBeenCalledOnce()
    expect(updated).toBe(3)
  })

  it('retorna 0 cuando no hay clientes que actualizar', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    mockExecute.mockResolvedValue([]) // empty RETURNING

    const { updated } = await recalcularEstadosActividad()

    expect(mockExecute).toHaveBeenCalledOnce()
    expect(updated).toBe(0)
  })
})

// ─── recalcularClientesNuevos ────────────────────────────────────────────────

describe('recalcularClientesNuevos — un SELECT agregado + updates solo para los que califican', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('llama a db.execute una sola vez para leer todos los pedidos', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    mockExecute.mockResolvedValue([]) // no eligible clients
    makeUpdateChain()

    await recalcularClientesNuevos()

    expect(mockExecute).toHaveBeenCalledOnce()
  })

  it('marca como nuevo al cliente con 3 pedidos dentro de la ventana', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    const { setUpdate } = makeUpdateChain()

    // 3 pedidos for cliente-1 within 85 days (< ventanaDias=90)
    mockExecute.mockResolvedValue([
      { cliente_id: 'c1', asignado_a: 'v1', rn: '1', fecha: daysAgo(85), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '2', fecha: daysAgo(50), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '3', fecha: daysAgo(10), total: '1000.00' },
    ])

    const { updated } = await recalcularClientesNuevos()

    expect(updated).toBe(1)
    expect(setUpdate).toHaveBeenCalledOnce()
    const arg = setUpdate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.estadoActividad).toBe('activo')
    expect(arg.vendedorConversionId).toBe('v1')
  })

  it('NO marca como nuevo cuando los pedidos están fuera de la ventana (100 días > 90)', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    const { setUpdate } = makeUpdateChain()

    mockExecute.mockResolvedValue([
      { cliente_id: 'c1', asignado_a: 'v1', rn: '1', fecha: daysAgo(200), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '2', fecha: daysAgo(150), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '3', fecha: daysAgo(100), total: '1000.00' },
    ])

    await recalcularClientesNuevos()

    expect(setUpdate).not.toHaveBeenCalled()
  })

  it('NO marca cuando hay menos de minPedidos (3)', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    const { setUpdate } = makeUpdateChain()

    mockExecute.mockResolvedValue([
      { cliente_id: 'c1', asignado_a: 'v1', rn: '1', fecha: daysAgo(10), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '2', fecha: daysAgo(5), total: '1000.00' },
    ])

    await recalcularClientesNuevos()

    expect(setUpdate).not.toHaveBeenCalled()
  })

  it('respeta montoMinimo: NO marca si el total de primeros 3 pedidos < montoMinimo', async () => {
    const cfgConMonto = { ...DEFAULT_CONFIG, clienteNuevoMontoMinimo: '5000.00' }
    mockBusinessConfigFindFirst.mockResolvedValue(cfgConMonto)
    const { setUpdate } = makeUpdateChain()

    // 3 pedidos × $1000 = $3000 < $5000
    mockExecute.mockResolvedValue([
      { cliente_id: 'c1', asignado_a: 'v1', rn: '1', fecha: daysAgo(10), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '2', fecha: daysAgo(7), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '3', fecha: daysAgo(4), total: '1000.00' },
    ])

    await recalcularClientesNuevos()

    expect(setUpdate).not.toHaveBeenCalled()
  })

  it('establece fechaConversionANuevo = fecha del N-ésimo pedido', async () => {
    mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
    const { setUpdate } = makeUpdateChain()

    const nthFecha = daysAgo(2)
    mockExecute.mockResolvedValue([
      { cliente_id: 'c1', asignado_a: 'v1', rn: '1', fecha: daysAgo(10), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '2', fecha: daysAgo(5), total: '1000.00' },
      { cliente_id: 'c1', asignado_a: 'v1', rn: '3', fecha: nthFecha, total: '1000.00' },
    ])

    await recalcularClientesNuevos()

    const arg = setUpdate.mock.calls[0]?.[0] as Record<string, unknown>
    const conversionDate = arg.fechaConversionANuevo as Date
    expect(conversionDate.toDateString()).toBe(nthFecha.toDateString())
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest. Variables
// they reference must also be hoisted via vi.hoisted.

const {
  mockBusinessConfigFindFirst,
  mockClientesFindFirst,
  mockPedidosFindFirst,
  mockPedidosFindMany,
  mockUpdate,
} = vi.hoisted(() => {
  return {
    mockBusinessConfigFindFirst: vi.fn(),
    mockClientesFindFirst: vi.fn(),
    mockPedidosFindFirst: vi.fn(),
    mockPedidosFindMany: vi.fn(),
    mockUpdate: vi.fn(),
  }
})

vi.mock('@/db', () => ({
  db: {
    query: {
      businessConfig: { findFirst: mockBusinessConfigFindFirst },
      clientes: { findFirst: mockClientesFindFirst },
      pedidos: {
        findFirst: mockPedidosFindFirst,
        findMany: mockPedidosFindMany,
      },
    },
    update: mockUpdate,
  },
}))

// Schema mock — the service imports table objects only to build WHERE clauses.
// Drizzle operators (eq, and, …) receive these objects but we just need them to
// be stable references; they are not inspected by the tests.
vi.mock('@/db/schema', () => ({
  businessConfig: { id: 'businessConfig.id', $inferSelect: {} },
  clientes: {
    id: 'clientes.id',
    deletedAt: 'clientes.deletedAt',
    fechaConversionANuevo: 'clientes.fechaConversionANuevo',
    vendedorConversionId: 'clientes.vendedorConversionId',
    estadoActividad: 'clientes.estadoActividad',
    asignadoA: 'clientes.asignadoA',
    updatedAt: 'clientes.updatedAt',
    $inferSelect: {},
  },
  pedidos: {
    clienteId: 'pedidos.clienteId',
    estado: 'pedidos.estado',
    estadoPago: 'pedidos.estadoPago',
    deletedAt: 'pedidos.deletedAt',
    fecha: 'pedidos.fecha',
    $inferSelect: {},
  },
}))

import { calcularEstadoActividad, evaluarClienteNuevo } from '@/lib/clientes/actividad.service'

// ─── Default config used across most tests ───────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date that is exactly `days` days in the past from "now". */
function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

/** Returns a Date that is exactly `days` days in the future from "now". */
function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

// ─── Tests: calcularEstadoActividad ──────────────────────────────────────────

describe('calcularEstadoActividad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cuando existe al menos un pedido confirmado', () => {
    it('retorna "activo" cuando el último pedido fue hace 30 días (activoDias=60)', async () => {
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(30) })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('activo')
    })

    it('retorna "activo" en el límite inferior: 0 días desde el último pedido', async () => {
      mockPedidosFindFirst.mockResolvedValue({ fecha: new Date() })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('activo')
    })

    it('retorna "inactivo" cuando el último pedido fue hace 70 días (activoDias=60, perdidoDias=180)', async () => {
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(70) })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('inactivo')
    })

    it('retorna "inactivo" en el límite: exactamente activoDias días atrás', async () => {
      // differenceInDays(now, now - 60 days) === 60 → NOT < 60 → inactivo
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(60) })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('inactivo')
    })

    it('retorna "perdido" cuando el último pedido fue hace 200 días (perdidoDias=180)', async () => {
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(200) })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('perdido')
    })

    it('retorna "perdido" en el límite: exactamente perdidoDias días atrás', async () => {
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(180) })

      const result = await calcularEstadoActividad('cliente-1', DEFAULT_CONFIG)

      expect(result).toBe('perdido')
    })
  })

  describe('cuando no existen pedidos confirmados', () => {
    it('retorna null', async () => {
      mockPedidosFindFirst.mockResolvedValue(null)

      const result = await calcularEstadoActividad('cliente-sin-pedidos', DEFAULT_CONFIG)

      expect(result).toBeNull()
    })
  })

  describe('cuando no se pasa config (usa getBusinessConfig internamente)', () => {
    it('consulta businessConfig y retorna el estado correcto', async () => {
      mockBusinessConfigFindFirst.mockResolvedValue(DEFAULT_CONFIG)
      mockPedidosFindFirst.mockResolvedValue({ fecha: daysAgo(30) })

      // No config argument — service must fetch it
      const result = await calcularEstadoActividad('cliente-1')

      expect(mockBusinessConfigFindFirst).toHaveBeenCalledOnce()
      expect(result).toBe('activo')
    })
  })
})

// ─── Tests: evaluarClienteNuevo ───────────────────────────────────────────────

describe('evaluarClienteNuevo', () => {
  const CLIENTE_ID = 'cliente-1'
  const VENDEDOR_ID = 'vendedor-1'

  const fakeCliente = {
    id: CLIENTE_ID,
    fechaConversionANuevo: null,
    asignadoA: VENDEDOR_ID,
  }

  // Chain helpers — db.update(...).set(...).where(...)
  function makeUpdateChain() {
    const whereUpdate = vi.fn().mockResolvedValue(undefined)
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockUpdate.mockReturnValue({ set: setUpdate })
    return { setUpdate, whereUpdate }
  }

  /** Builds N pedidos with dates spaced 1 day apart starting from `startDate`. */
  function buildPedidos(
    count: number,
    startDate: Date,
    total = '1000.00',
    estadoPago: 'pagado' | 'parcial' | 'impago' = 'pagado',
  ): Array<{ id: string; fecha: Date; total: string; montoPagado: string; estadoPago: string }> {
    return Array.from({ length: count }, (_, i) => {
      const fecha = new Date(startDate)
      fecha.setDate(fecha.getDate() + i)
      return { id: `pedido-${i + 1}`, fecha, total, montoPagado: estadoPago === 'impago' ? '0.00' : total, estadoPago }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Minimum pedidos threshold ─────────────────────────────────────────────

  describe('minPedidos', () => {
    it('NO marca como nuevo cuando solo hay 2 pedidos confirmados+pagados (minPedidos=3)', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      mockPedidosFindMany.mockResolvedValue(buildPedidos(2, new Date()))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).not.toHaveBeenCalled()
    })

    it('evalúa la ventana cuando hay exactamente minPedidos (3) pedidos pagados', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // 3 pedidos pagados within 2 days
      mockPedidosFindMany.mockResolvedValue(buildPedidos(3, new Date()))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).toHaveBeenCalledOnce()
    })

    it('NO marca como nuevo cuando los 3 pedidos están impagos (estadoPago=impago)', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // Service filters impago orders out, so findMany returns empty list
      mockPedidosFindMany.mockResolvedValue([])
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).not.toHaveBeenCalled()
    })
  })

  // ── Ventana de días ───────────────────────────────────────────────────────

  describe('ventanaDias', () => {
    it('NO marca como nuevo cuando 3 pedidos se distribuyen en 100 días (ventanaDias=90)', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // Pedido 1 = today − 100 days, pedido 2 = today − 50 days, pedido 3 = today
      const p1 = daysAgo(100)
      const p2 = daysAgo(50)
      const p3 = new Date()
      mockPedidosFindMany.mockResolvedValue([
        { id: 'p1', fecha: p1, total: '1000.00', montoPagado: '1000.00', estadoPago: 'pagado' },
        { id: 'p2', fecha: p2, total: '1000.00', montoPagado: '1000.00', estadoPago: 'pagado' },
        { id: 'p3', fecha: p3, total: '1000.00', montoPagado: '1000.00', estadoPago: 'pagado' },
      ])
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).not.toHaveBeenCalled()
    })

    it('MARCA como nuevo cuando 3 pedidos ocurren dentro de 85 días (ventanaDias=90)', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      const start = daysAgo(85)
      const pedidosData = buildPedidos(3, start)
      mockPedidosFindMany.mockResolvedValue(pedidosData)
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).toHaveBeenCalledOnce()
    })

    it('establece fechaConversionANuevo igual a la fecha del 3er pedido', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      const start = daysAgo(10)
      const pedidosData = buildPedidos(3, start)
      const tercerPedidoFecha = pedidosData[2]!.fecha
      mockPedidosFindMany.mockResolvedValue(pedidosData)
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      const setArg = setUpdate.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.fechaConversionANuevo).toEqual(tercerPedidoFecha)
    })

    it('establece vendedorConversionId igual a cliente.asignadoA', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      mockPedidosFindMany.mockResolvedValue(buildPedidos(3, daysAgo(10)))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      const setArg = setUpdate.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg.vendedorConversionId).toBe(VENDEDOR_ID)
    })
  })

  // ── Idempotencia ──────────────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('NO actualiza si fechaConversionANuevo ya está establecida', async () => {
      // Cliente already converted
      mockClientesFindFirst.mockResolvedValue({
        ...fakeCliente,
        fechaConversionANuevo: daysAgo(5),
      })
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).not.toHaveBeenCalled()
      // Also should not have queried pedidos — exits early
      expect(mockPedidosFindMany).not.toHaveBeenCalled()
    })
  })

  // ── Monto mínimo ──────────────────────────────────────────────────────────

  describe('montoMinimo', () => {
    const configConMonto = { ...DEFAULT_CONFIG, clienteNuevoMontoMinimo: '5000.00' }

    it('NO marca como nuevo cuando el total de los primeros 3 pedidos es menor que montoMinimo', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // 3 pedidos × $1000 = $3000 < $5000
      mockPedidosFindMany.mockResolvedValue(buildPedidos(3, daysAgo(10), '1000.00'))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, configConMonto)

      expect(setUpdate).not.toHaveBeenCalled()
    })

    it('MARCA como nuevo cuando el total de los primeros 3 pedidos es mayor o igual al montoMinimo', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // 3 pedidos × $2000 = $6000 >= $5000
      mockPedidosFindMany.mockResolvedValue(buildPedidos(3, daysAgo(10), '2000.00'))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, configConMonto)

      expect(setUpdate).toHaveBeenCalledOnce()
    })

    it('no aplica el filtro de monto cuando clienteNuevoMontoMinimo es null', async () => {
      // DEFAULT_CONFIG has montoMinimo = null → skip the check
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      mockPedidosFindMany.mockResolvedValue(buildPedidos(3, daysAgo(10), '1.00'))
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)

      expect(setUpdate).toHaveBeenCalledOnce()
    })

    it('exactamente igual al montoMinimo también marca como nuevo', async () => {
      mockClientesFindFirst.mockResolvedValue(fakeCliente)
      // 3 pedidos × $1666.67 ≈ $5000.01; use $5000/3 ≈ $1666.67 each
      // Simpler: 1 pedido de $5000 + padding — actually use exact total
      mockPedidosFindMany.mockResolvedValue([
        { id: 'p1', fecha: daysAgo(2), total: '2000.00', montoPagado: '2000.00', estadoPago: 'pagado' },
        { id: 'p2', fecha: daysAgo(1), total: '2000.00', montoPagado: '2000.00', estadoPago: 'pagado' },
        { id: 'p3', fecha: new Date(), total: '1000.00', montoPagado: '1000.00', estadoPago: 'pagado' },
      ])
      const { setUpdate } = makeUpdateChain()

      await evaluarClienteNuevo(CLIENTE_ID, configConMonto)

      expect(setUpdate).toHaveBeenCalledOnce()
    })
  })

  // ── Cliente no encontrado ─────────────────────────────────────────────────

  describe('cliente no encontrado', () => {
    it('retorna sin error ni actualización si el cliente no existe', async () => {
      mockClientesFindFirst.mockResolvedValue(null)
      const { setUpdate } = makeUpdateChain()

      await expect(evaluarClienteNuevo(CLIENTE_ID, DEFAULT_CONFIG)).resolves.toBeUndefined()
      expect(setUpdate).not.toHaveBeenCalled()
    })
  })
})

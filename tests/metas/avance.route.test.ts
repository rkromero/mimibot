/**
 * End-to-end avance route test
 *
 * Strategy: import the REAL avance.service (no vi.mock for it).
 * Mock only @/db (select chain + query.metas.findFirst) and the auth/session helpers.
 * This verifies the full path: route → service → response JSON includes pctClientesConPedido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockMetasFindFirst, mockSelect, mockAuth, mockGetSessionContext } = vi.hoisted(() => ({
  mockMetasFindFirst: vi.fn(),
  mockSelect: vi.fn(),
  mockAuth: vi.fn(),
  mockGetSessionContext: vi.fn(),
}))

// Mock @/db — avance.service uses db.query.metas.findFirst and db.select chains
vi.mock('@/db', () => ({
  db: {
    query: {
      metas: { findFirst: mockMetasFindFirst },
      territorioAgente: { findMany: vi.fn().mockResolvedValue([]) },
      territorioGerente: { findMany: vi.fn().mockResolvedValue([]) },
    },
    select: mockSelect,
  },
}))

// Schema mock — must include every field accessed at runtime by avance.service
vi.mock('@/db/schema', () => ({
  clientes: {
    id: 'clientes.id',
    vendedorConversionId: 'clientes.vendedorConversionId',
    fechaConversionANuevo: 'clientes.fechaConversionANuevo',
    asignadoA: 'clientes.asignadoA',
    deletedAt: 'clientes.deletedAt',
    createdAt: 'clientes.createdAt',
    $inferSelect: {},
  },
  pedidos: {
    id: 'pedidos.id',
    clienteId: 'pedidos.clienteId',
    vendedorId: 'pedidos.vendedorId',
    estado: 'pedidos.estado',
    estadoPago: 'pedidos.estadoPago',
    fecha: 'pedidos.fecha',
    total: 'pedidos.total',
    montoPagado: 'pedidos.montoPagado',
    deletedAt: 'pedidos.deletedAt',
    $inferSelect: {},
  },
  movimientosCC: {
    id: 'movimientosCC.id',
    clienteId: 'movimientosCC.clienteId',
    tipo: 'movimientosCC.tipo',
    monto: 'movimientosCC.monto',
    fecha: 'movimientosCC.fecha',
    deletedAt: 'movimientosCC.deletedAt',
    $inferSelect: {},
  },
  leads: {
    id: 'leads.id',
    assignedTo: 'leads.assignedTo',
    wonAt: 'leads.wonAt',
    deletedAt: 'leads.deletedAt',
    $inferSelect: {},
  },
  metas: {
    id: 'metas.id',
    vendedorId: 'metas.vendedorId',
    periodoAnio: 'metas.periodoAnio',
    periodoMes: 'metas.periodoMes',
    $inferSelect: {},
  },
  territorioAgente: {
    territorioId: 'territorioAgente.territorioId',
    agenteId: 'territorioAgente.agenteId',
  },
  territorioGerente: {
    gerenteId: 'territorioGerente.gerenteId',
    territorioId: 'territorioGerente.territorioId',
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetSessionContext }))

// Import the real route — avance.service is NOT mocked, real logic runs
import { GET as getAvance } from '@/app/api/metas/avance/route'

// ─── Helpers (mirror avance.service.test.ts pattern) ─────────────────────────

function makeSelectResult(resolvedValue: unknown) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  return { fromFn, whereFn, stub: { from: fromFn } }
}

/**
 * Feed the 10 stubs for the "no clientes asignados" scenario.
 *
 * Call ordering inside calcularAvanceMeta (Promise.all of 7 sub-functions):
 *   #0  clientesNuevosDelPeriodo        → count from clientes (WHERE vendedorConversionId)
 *   #1  pedidosConfirmadosDelPeriodo    → count from pedidos
 *   #2  montoCobradoDelPeriodo (a)      → select id from clientes (WHERE asignadoA) → []
 *   #3  conversionLeadsDelPeriodo ganados → count from leads
 *   #4  conversionLeadsDelPeriodo gestionados → count from leads
 *   #5  pctClientesConPedidoDelPeriodo (a) → select id from clientes (WHERE asignadoA) → []
 *   #6  pctPedidosPagadosDelPeriodo (a) → denominador count
 *   #7  pctPedidosPagadosDelPeriodo (b) → numerador count
 *   #8  pctCobranzaDelPeriodo (a)       → denominador sum(total)
 *   #9  pctCobranzaDelPeriodo (b)       → numerador sum(montoPagado)
 *
 * Calls #10 (montoSum) and #11 (pctPedidos) are NOT made because their
 * preceding clientes queries (#2 and #5) returned empty arrays.
 */
function setupNoClientesStubs() {
  mockSelect
    .mockReturnValueOnce(makeSelectResult([{ total: 2 }]).stub)    // #0 clientesNuevos → 2
    .mockReturnValueOnce(makeSelectResult([{ total: 5 }]).stub)    // #1 pedidos → 5
    .mockReturnValueOnce(makeSelectResult([]).stub)                // #2 montoClienteIds → [] (no clients)
    .mockReturnValueOnce(makeSelectResult([{ total: 3 }]).stub)    // #3 leadsGanados → 3
    .mockReturnValueOnce(makeSelectResult([{ total: 10 }]).stub)   // #4 leadsGestionados → 10
    .mockReturnValueOnce(makeSelectResult([]).stub)                // #5 pctClienteIds → [] (no clients → null)
    .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)    // #6 pctPedidosPagados den
    .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)    // #7 pctPedidosPagados num
    .mockReturnValueOnce(makeSelectResult([{ total: null }]).stub) // #8 pctCobranza den
    .mockReturnValueOnce(makeSelectResult([{ total: null }]).stub) // #9 pctCobranza num
    // Calls #10/#11 skipped (no montoSum / no pctPedidos due to empty clientes)
    .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)    // #12 clientesCreadosCount
    .mockReturnValueOnce(makeSelectResult([]).stub)                // #13 clientesCreadosConPedidoIds → [] → returns 0 early
    .mockReturnValueOnce(makeSelectResult([]).stub)                // #15 primerPedidoEnPeriodo → [] → returns 0 early
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VENDEDOR_ID = '00000000-0000-0000-0000-000000000002'
const META_ID = '00000000-0000-0000-0000-000000000003'

const AGENT_SESSION = {
  user: { id: VENDEDOR_ID, email: 'agent@test.com', name: 'Agent', role: 'agent' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const AGENT_CTX = {
  userId: VENDEDOR_ID,
  role: 'agent' as const,
  agentesVisibles: [],
  territoriosGestionados: [],
}

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    id: META_ID,
    vendedorId: VENDEDOR_ID,
    periodoAnio: 2026,
    periodoMes: 5,
    clientesNuevosObjetivo: 5,
    pedidosObjetivo: 10,
    montoCobradoObjetivo: '50000.00',
    conversionLeadsObjetivo: '25.00',
    pctClientesConPedidoObjetivo: '80.00',
    pctPedidosPagadosObjetivo: '0.00',
    pctCobranzaObjetivo: '0.00',
    creadoPor: '00000000-0000-0000-0000-000000000001',
    fechaCreacion: new Date('2026-05-01'),
    fechaActualizacion: new Date('2026-05-01'),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/metas/avance — end-to-end (real avance.service, mocked db)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockAuth.mockResolvedValue(AGENT_SESSION)
    mockGetSessionContext.mockResolvedValue(AGENT_CTX)

    // findFirst is called twice: once in calcularAvanceVendedor, once in calcularAvanceMeta
    mockMetasFindFirst.mockResolvedValue(makeMeta())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('(task 6) JSON incluye pctClientesConPedido con estado="na" cuando el vendedor no tiene clientes asignados', async () => {
    setupNoClientesStubs()

    const req = new NextRequest('http://localhost/api/metas/avance?anio=2026&mes=5')
    const response = await getAvance(req)
    const body = await response.json()

    expect(response.status).toBe(200)

    // The real service returned null for pctClientesConPedidoDelPeriodo
    // The real calcularAvanceMeta mapped that to estado='na'
    expect(body.data).toHaveProperty('pctClientesConPedido')
    expect(body.data.pctClientesConPedido.estado).toBe('na')
    expect(body.data.pctClientesConPedido.alcanzado).toBeNull()
    expect(body.data.pctClientesConPedido.pct).toBeNull()
    expect(body.data.pctClientesConPedido.proyeccion).toBeNull()
  })

  it('(task 6) JSON incluye pctClientesConPedido con valores calculados cuando hay clientes con pedidos', async () => {
    const clienteId1 = 'c1'
    const clienteId2 = 'c2'

    // #0 clientesNuevos
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 2 }]).stub)
    // #1 pedidos count
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 8 }]).stub)
    // #2 montoClienteIds → 2 clientes asignados
    mockSelect.mockReturnValueOnce(makeSelectResult([{ id: clienteId1 }, { id: clienteId2 }]).stub)
    // #3 leadsGanados
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 4 }]).stub)
    // #4 leadsGestionados
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 10 }]).stub)
    // #5 pctClienteIds → 2 clientes asignados
    mockSelect.mockReturnValueOnce(makeSelectResult([{ id: clienteId1 }, { id: clienteId2 }]).stub)
    // #6 pctPedidosPagados denominador
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)
    // #7 pctPedidosPagados numerador
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)
    // #8 pctCobranza denominador
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: null }]).stub)
    // #9 pctCobranza numerador
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: null }]).stub)
    // #10 montoSum (after #2 resolves)
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: '45000.00' }]).stub)
    // #11 pctPedidos → both clients have a pedido
    mockSelect.mockReturnValueOnce(makeSelectResult([{ clienteId: clienteId1 }, { clienteId: clienteId2 }]).stub)
    // #12 clientesCreadosCount
    mockSelect.mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)
    // #13 clientesCreadosConPedidoIds → [] → returns 0 early
    mockSelect.mockReturnValueOnce(makeSelectResult([]).stub)
    // #15 primerPedidoEnPeriodo → [] → returns 0 early (no second query needed)
    mockSelect.mockReturnValueOnce(makeSelectResult([]).stub)

    const req = new NextRequest('http://localhost/api/metas/avance?anio=2026&mes=5')
    const response = await getAvance(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('pctClientesConPedido')

    // 2 out of 2 clients have pedidos → 100%
    expect(body.data.pctClientesConPedido.alcanzado).toBe(100)
    // objetivo = 80%, alcanzado = 100% → pct = 125% → cumplida
    expect(body.data.pctClientesConPedido.estado).toBe('cumplida')
  })
})

/**
 * Tests for getAdminDashboardStats with territory/gerente filters,
 * and for the GET /api/admin/dashboard-kpis route UUID validation.
 *
 * Pattern: mock @/db (select chain) and auth helpers.
 * The real service logic runs — only db and auth are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockAuth, mockRequireAdmin } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  pedidos: {
    id: 'pedidos.id',
    clienteId: 'pedidos.clienteId',
    fecha: 'pedidos.fecha',
    estadoPago: 'pedidos.estadoPago',
    deletedAt: 'pedidos.deletedAt',
    territorioIdImputado: 'pedidos.territorioIdImputado',
    saldoPendiente: 'pedidos.saldoPendiente',
    $inferSelect: {},
  },
  pedidoItems: {
    id: 'pedidoItems.id',
    pedidoId: 'pedidoItems.pedidoId',
    cantidad: 'pedidoItems.cantidad',
    $inferSelect: {},
  },
  territorioGerente: {
    territorioId: 'territorioGerente.territorioId',
    gerenteId: 'territorioGerente.gerenteId',
    $inferSelect: {},
  },
  clientes: {
    id: 'clientes.id',
    territorioId: 'clientes.territorioId',
    createdAt: 'clientes.createdAt',
    deletedAt: 'clientes.deletedAt',
    $inferSelect: {},
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))

import { getAdminDashboardStats } from '@/lib/admin/dashboard.service'
import { GET as getDashboardKpis } from '@/app/api/admin/dashboard-kpis/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock select chain that supports both:
 *   db.select().from().where()
 *   db.select().from().innerJoin().where()
 */
function makeChain(resolvedValue: unknown) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue)
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn })
  return { stub: { from: fromFn }, whereFn, fromFn, innerJoinFn }
}

/** For db.select().from().where().groupBy() chains (clientesCreadosPorDia query) */
function makeGroupByChain(resolvedValue: unknown) {
  const groupByFn = vi.fn().mockResolvedValue(resolvedValue)
  const whereFn = vi.fn().mockReturnValue({ groupBy: groupByFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  return { stub: { from: fromFn }, groupByFn, whereFn, fromFn }
}

/** For db.select().from().innerJoin().where().groupBy() chains (conPedidoMismoDia query) */
function makeGroupByJoinChain(resolvedValue: unknown) {
  const groupByFn = vi.fn().mockResolvedValue(resolvedValue)
  const whereFn = vi.fn().mockReturnValue({ groupBy: groupByFn })
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn })
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn })
  return { stub: { from: fromFn }, groupByFn, whereFn, innerJoinFn, fromFn }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const TERRITORIO_UUID = '11111111-1111-1111-1111-111111111111'
const GERENTE_UUID = '22222222-2222-2222-2222-222222222222'
const GERENTE_SIN_TERRITORIOS_UUID = '44444444-4444-4444-4444-444444444444'

// ─── Service tests ────────────────────────────────────────────────────────────

describe('getAdminDashboardStats — filtros de territorio/gerente', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('(a) sin filtros: sin pedidos → devuelve ceros con chartData de 30 días (Junio)', async () => {
    // pedidosMes → []
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // productosVendidos
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub)
    // carteraActiva
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub)
    // clientesCreadosPorDia → ningún cliente
    mockSelect.mockReturnValueOnce(makeGroupByChain([]).stub)
    // conPedidoMismoDia → ningún cliente con pedido el mismo día
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.productosVendidos).toBe(0)
    expect(result.carteraActiva).toBe(0)
    expect(result.mesNombre).toBe('Junio')
    expect(result.chartData).toHaveLength(30)
    expect(mockSelect).toHaveBeenCalledTimes(5)
  })

  it('(a) sin filtros: con pedidos → devuelve totales y chartData correctos', async () => {
    const pedidoMes = { id: 'p1', clienteId: 'c1', fecha: new Date(2026, 5, 5) }

    // pedidosMes → 1 pedido
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // allPaid → mismo pedido (rango histórico global)
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // productosVendidos
    mockSelect.mockReturnValueOnce(makeChain([{ total: 10 }]).stub)
    // carteraActiva
    mockSelect.mockReturnValueOnce(makeChain([{ total: '5000' }]).stub)
    // clientesCreadosPorDia
    mockSelect.mockReturnValueOnce(makeGroupByChain([]).stub)
    // conPedidoMismoDia
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.productosVendidos).toBe(10)
    expect(result.carteraActiva).toBe(5000)
    // p1 es el 1er pedido de c1 → primerPedido[día 5] = 1
    expect(result.chartData[4]!.primerPedido).toBe(1)
    expect(mockSelect).toHaveBeenCalledTimes(6)
  })

  it('(b) con territorioId: filtra las 3 queries y devuelve datos del territorio', async () => {
    const pedidoMes = { id: 'p2', clienteId: 'c2', fecha: new Date(2026, 5, 10) }

    // pedidosMes → filtrado por territorio
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // allPaid → histórico global (sin filtro territorio)
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // productosVendidos → resultado del territorio
    mockSelect.mockReturnValueOnce(makeChain([{ total: 7 }]).stub)
    // carteraActiva → resultado del territorio
    mockSelect.mockReturnValueOnce(makeChain([{ total: '3000' }]).stub)
    // clientesCreadosPorDia → filtrado por territorio
    mockSelect.mockReturnValueOnce(makeGroupByChain([]).stub)
    // conPedidoMismoDia → filtrado por territorio
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6, { territorioId: TERRITORIO_UUID })

    expect(result.productosVendidos).toBe(7)
    expect(result.carteraActiva).toBe(3000)
    // No extra query por territorio (se pasó directo)
    expect(mockSelect).toHaveBeenCalledTimes(6)
  })

  it('(c) con gerenteId: resuelve territorios primero, luego filtra las 3 queries con inArray', async () => {
    const pedidoMes = { id: 'p3', clienteId: 'c3', fecha: new Date(2026, 5, 15) }

    // territorioGerente → 1 territorio para el gerente
    mockSelect.mockReturnValueOnce(makeChain([{ territorioId: TERRITORIO_UUID }]).stub)
    // pedidosMes → filtrado por territorio del gerente
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // allPaid → histórico global
    mockSelect.mockReturnValueOnce(makeChain([pedidoMes]).stub)
    // productosVendidos
    mockSelect.mockReturnValueOnce(makeChain([{ total: 5 }]).stub)
    // carteraActiva
    mockSelect.mockReturnValueOnce(makeChain([{ total: '2000' }]).stub)
    // clientesCreadosPorDia → filtrado por territorio del gerente
    mockSelect.mockReturnValueOnce(makeGroupByChain([]).stub)
    // conPedidoMismoDia → filtrado por territorio del gerente
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6, { gerenteId: GERENTE_UUID })

    expect(result.productosVendidos).toBe(5)
    expect(result.carteraActiva).toBe(2000)
    // 7 calls: territorioGerente + pedidosMes + allPaid + productos + cartera + clientesCreados + conPedido
    expect(mockSelect).toHaveBeenCalledTimes(7)
  })

  it('(d) gerente sin territorios: devuelve ceros sin consultar pedidos', async () => {
    // territorioGerente → sin territorios
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6, { gerenteId: GERENTE_SIN_TERRITORIOS_UUID })

    expect(result.productosVendidos).toBe(0)
    expect(result.carteraActiva).toBe(0)
    expect(result.mesNombre).toBe('Junio')
    expect(result.chartData).toHaveLength(30)
    expect(result.chartData.every((d) => d.primerPedido === 0 && d.clienteNuevo === 0)).toBe(true)
    // clientesCreadosPorDia también en cero, con conPedido: 0 en cada día
    expect(result.clientesCreadosPorDia).toHaveLength(30)
    expect(result.clientesCreadosPorDia.every((d) => d.total === 0 && d.conPedido === 0)).toBe(true)
    // Solo 1 llamada: la query de territorioGerente. No se consultan pedidos.
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })
})

// ─── Route tests ──────────────────────────────────────────────────────────────

describe('GET /api/admin/dashboard-kpis — validación UUID', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('(e) responde 400 con territorioId inválido (no es UUID)', async () => {
    const req = new NextRequest(
      'http://localhost/api/admin/dashboard-kpis?anio=2026&mes=6&territorioId=no-es-uuid',
    )
    const response = await getDashboardKpis(req)
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  it('(e) responde 400 con gerenteId inválido (no es UUID)', async () => {
    const req = new NextRequest(
      'http://localhost/api/admin/dashboard-kpis?anio=2026&mes=6&gerenteId=not-a-uuid',
    )
    const response = await getDashboardKpis(req)
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  it('(e) responde 400 con territorioId que parece UUID pero tiene formato incorrecto', async () => {
    const req = new NextRequest(
      'http://localhost/api/admin/dashboard-kpis?anio=2026&mes=6&territorioId=12345678-1234-1234-1234-12345678901',
    )
    const response = await getDashboardKpis(req)
    expect(response.status).toBe(400)
  })
})

// ─── clientesCreadosPorDia tests ──────────────────────────────────────────────

describe('getAdminDashboardStats — clientesCreadosPorDia', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('(a) tiene un elemento por día del mes con los conteos correctos', async () => {
    // pedidosMes → []
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // productosVendidos
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub)
    // carteraActiva
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub)
    // clientesCreadosPorDia: 2 clientes el día 3, 1 cliente el día 15
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 3, total: 2 }, { day: 15, total: 1 }]).stub)
    // conPedidoMismoDia: 1 de los del día 3 tiene pedido ese día
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 3, conPedido: 1 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.clientesCreadosPorDia).toHaveLength(30)       // 30 días en junio
    expect(result.clientesCreadosPorDia[2]!.day).toBe(3)        // día 3 (idx 2)
    expect(result.clientesCreadosPorDia[2]!.total).toBe(2)      // 2 clientes ese día
    expect(result.clientesCreadosPorDia[2]!.conPedido).toBe(1)  // 1 con pedido ese día
    expect(result.clientesCreadosPorDia[14]!.day).toBe(15)
    expect(result.clientesCreadosPorDia[14]!.total).toBe(1)
    expect(result.clientesCreadosPorDia[14]!.conPedido).toBe(0) // sin pedido el mismo día
  })

  it('(b) días sin clientes creados devuelven total=0', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub)
    // Solo 1 día con clientes; el resto debe ser 0
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 10, total: 3 }]).stub)
    // conPedidoMismoDia → ninguno
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia10 = result.clientesCreadosPorDia.find((d) => d.day === 10)
    const dia5 = result.clientesCreadosPorDia.find((d) => d.day === 5)
    expect(dia10?.total).toBe(3)
    expect(dia5?.total).toBe(0)
    // Todos los demás días también 0
    const sinClientes = result.clientesCreadosPorDia.filter((d) => d.day !== 10)
    expect(sinClientes.every((d) => d.total === 0)).toBe(true)
  })

  it('(c) clientes eliminados o creados fuera del mes no se cuentan (DB no los devuelve)', async () => {
    // The WHERE clause in the service filters deletedAt IS NULL and date range.
    // DB returns empty because all matching rows are filtered out.
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub)
    mockSelect.mockReturnValueOnce(makeGroupByChain([]).stub)   // DB returns [] after applying filters
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.clientesCreadosPorDia.every((d) => d.total === 0 && d.conPedido === 0)).toBe(true)
  })

  it('(d) se cuentan clientes aunque no tengan pedidos (no hay filtro por pedidos)', async () => {
    // The clientes query has no JOIN with pedidos → counts all clients regardless
    // Stub returns 5 clients on day 7 (could be any clients, with or without orders)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub)
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub)
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 7, total: 5 }]).stub)
    // conPedidoMismoDia → 2 de esos 5 pidieron el mismo día
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 7, conPedido: 2 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia7 = result.clientesCreadosPorDia.find((d) => d.day === 7)
    expect(dia7?.total).toBe(5)
    expect(dia7?.conPedido).toBe(2)
  })
})

// ─── conPedido (clientes con pedido el mismo día) tests ────────────────────────

describe('getAdminDashboardStats — conPedido el mismo día', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  /** Stubs the first 3 queries (pedidosMes/productos/cartera) with empty results */
  function stubBaseQueries() {
    mockSelect.mockReturnValueOnce(makeChain([]).stub)            // pedidosMes
    mockSelect.mockReturnValueOnce(makeChain([{ total: 0 }]).stub) // productosVendidos
    mockSelect.mockReturnValueOnce(makeChain([{ total: '0' }]).stub) // carteraActiva
  }

  it('(a) cliente creado el día N con pedido de fecha día N suma 1 a conPedido del día N', async () => {
    stubBaseQueries()
    // total: 1 cliente el día 12
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 12, total: 1 }]).stub)
    // conPedido: ese cliente tiene un pedido del mismo día (la DB resuelve date()=date())
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 12, conPedido: 1 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia12 = result.clientesCreadosPorDia.find((d) => d.day === 12)
    expect(dia12?.total).toBe(1)
    expect(dia12?.conPedido).toBe(1)
  })

  it('(b) cliente cuyo único pedido es de un día distinto NO suma a conPedido', async () => {
    stubBaseQueries()
    // total: 1 cliente el día 12
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 12, total: 1 }]).stub)
    // conPedido: la DB no devuelve el día 12 porque date(fecha) != date(createdAt)
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia12 = result.clientesCreadosPorDia.find((d) => d.day === 12)
    expect(dia12?.total).toBe(1)
    expect(dia12?.conPedido).toBe(0)
  })

  it('(c) cliente con varios pedidos el mismo día cuenta una sola vez (count distinct)', async () => {
    stubBaseQueries()
    // total: 1 cliente el día 8
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 8, total: 1 }]).stub)
    // conPedido: count(distinct clientes.id) → 1 aunque el cliente tenga varios pedidos ese día
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 8, conPedido: 1 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia8 = result.clientesCreadosPorDia.find((d) => d.day === 8)
    expect(dia8?.conPedido).toBe(1)
  })

  it('(d) pedidos eliminados (deletedAt) no cuentan en conPedido', async () => {
    stubBaseQueries()
    // total: 1 cliente el día 20
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 20, total: 1 }]).stub)
    // conPedido: el único pedido del día está eliminado → la DB lo filtra (isNull deletedAt)
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia20 = result.clientesCreadosPorDia.find((d) => d.day === 20)
    expect(dia20?.total).toBe(1)
    expect(dia20?.conPedido).toBe(0)
  })

  it('(e) conPedido nunca supera total (se clampa a total)', async () => {
    stubBaseQueries()
    // total: 3 clientes el día 5
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 5, total: 3 }]).stub)
    // conPedido: la DB devuelve un valor mayor que total (no debería pasar, pero se clampa)
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 5, conPedido: 5 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    const dia5 = result.clientesCreadosPorDia.find((d) => d.day === 5)
    expect(dia5?.total).toBe(3)
    expect(dia5?.conPedido).toBe(3) // clampeado a total
    // Invariante global: conPedido <= total en todos los días
    expect(result.clientesCreadosPorDia.every((d) => d.conPedido <= d.total)).toBe(true)
  })

  it('(f) la serie total (línea) conserva su comportamiento previo', async () => {
    stubBaseQueries()
    // total: igual fixture que el test original de clientesCreadosPorDia
    mockSelect.mockReturnValueOnce(makeGroupByChain([{ day: 3, total: 2 }, { day: 15, total: 1 }]).stub)
    // conPedido: con datos en otro día, no afecta la serie total
    mockSelect.mockReturnValueOnce(makeGroupByJoinChain([{ day: 3, conPedido: 1 }]).stub)

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.clientesCreadosPorDia).toHaveLength(30)
    expect(result.clientesCreadosPorDia[2]!.total).toBe(2)
    expect(result.clientesCreadosPorDia[14]!.total).toBe(1)
    // El resto de los días sigue en total 0
    const otros = result.clientesCreadosPorDia.filter((d) => d.day !== 3 && d.day !== 15)
    expect(otros.every((d) => d.total === 0)).toBe(true)
  })
})

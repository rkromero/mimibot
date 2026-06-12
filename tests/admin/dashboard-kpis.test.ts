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

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.productosVendidos).toBe(0)
    expect(result.carteraActiva).toBe(0)
    expect(result.mesNombre).toBe('Junio')
    expect(result.chartData).toHaveLength(30)
    expect(mockSelect).toHaveBeenCalledTimes(3)
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

    const result = await getAdminDashboardStats(2026, 6)

    expect(result.productosVendidos).toBe(10)
    expect(result.carteraActiva).toBe(5000)
    // p1 es el 1er pedido de c1 → primerPedido[día 5] = 1
    expect(result.chartData[4]!.primerPedido).toBe(1)
    expect(mockSelect).toHaveBeenCalledTimes(4)
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

    const result = await getAdminDashboardStats(2026, 6, { territorioId: TERRITORIO_UUID })

    expect(result.productosVendidos).toBe(7)
    expect(result.carteraActiva).toBe(3000)
    // No extra query por territorio (se pasó directo)
    expect(mockSelect).toHaveBeenCalledTimes(4)
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

    const result = await getAdminDashboardStats(2026, 6, { gerenteId: GERENTE_UUID })

    expect(result.productosVendidos).toBe(5)
    expect(result.carteraActiva).toBe(2000)
    // 5 calls: territorioGerente + pedidosMes + allPaid + productos + cartera
    expect(mockSelect).toHaveBeenCalledTimes(5)
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

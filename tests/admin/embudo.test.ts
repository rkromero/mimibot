/**
 * Tests for getEmbudo (embudo de apertura) and the GET /api/admin/embudo route.
 *
 * Pattern (same as tests/admin/dashboard-kpis.test.ts): mock @/db (select chain)
 * and auth helpers. The real service logic runs — only db and auth are stubbed.
 * The WHERE clauses (date range, territory/vendor filters, deletedAt) are applied
 * by the DB, so the mocks return the already-filtered rows the service would see.
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
    vendedorId: 'pedidos.vendedorId',
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
    creadoPor: 'clientes.creadoPor',
    $inferSelect: {},
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))

import { getEmbudo } from '@/lib/admin/embudo.service'
import { GET as getEmbudoRoute } from '@/app/api/admin/embudo/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a mock select chain for db.select().from().where() */
function makeChain(resolvedValue: unknown) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  return { stub: { from: fromFn }, whereFn, fromFn }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const TERRITORIO_UUID = '11111111-1111-1111-1111-111111111111'
const GERENTE_UUID = '22222222-2222-2222-2222-222222222222'
const VENDEDOR_UUID = '33333333-3333-3333-3333-333333333333'
const GERENTE_SIN_TERRITORIOS_UUID = '44444444-4444-4444-4444-444444444444'

// Rango de ejemplo: semana del 8 al 15 de junio de 2026 (local midnight).
const DESDE = new Date(2026, 5, 8)
const HASTA = new Date(2026, 5, 15)

// ─── Service tests ────────────────────────────────────────────────────────────

describe('getEmbudo — métricas', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('(a) aperturas cuenta solo los clientes que la DB devuelve para el rango', async () => {
    // aperturas → 2 clientes (la DB ya filtró rango + deletedAt)
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1' }, { id: 'c2' }]).stub)
    // aperturasConPedido → c1 tiene pedido
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }]).stub)
    // pedidosRango → ninguno (no se consulta historial)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA })

    expect(result.aperturas).toBe(2)
    expect(result.primerosPedidos).toBe(0)
    expect(result.recompras).toBe(0)
    expect(result.consolidados).toBe(0)
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('(b) aperturasConPedido cuenta clientes con pedido de cualquier fecha (distinct) y nunca supera aperturas', async () => {
    // aperturas → 3 clientes
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]).stub)
    // aperturasConPedido → c1 (varios pedidos) + c2 → 2 distintos; c3 sin pedidos
    mockSelect.mockReturnValueOnce(
      makeChain([{ clienteId: 'c1' }, { clienteId: 'c1' }, { clienteId: 'c2' }]).stub,
    )
    // pedidosRango → ninguno
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA })

    expect(result.aperturas).toBe(3)
    expect(result.aperturasConPedido).toBe(2)
    expect(result.aperturasConPedido).toBeLessThanOrEqual(result.aperturas)
  })

  it('(b2) sin aperturas no consulta pedidos de la cohorte (aperturasConPedido = 0)', async () => {
    // aperturas → []
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // pedidosRango → [] (la query de aperturasConPedido se omite)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA })

    expect(result.aperturas).toBe(0)
    expect(result.aperturasConPedido).toBe(0)
    // Solo 2 llamadas: aperturas + pedidosRango (sin conPedido ni historial)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('(c) un pedido rank 1 en el rango suma a primerosPedidos y no a recompras; rank ≥ 2 al revés', async () => {
    // aperturas → [] (foco en pedidos)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // pedidosRango → p1 (c1) y p2 (c2)
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'p1', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'impago' },
        { id: 'p2', clienteId: 'c2', fecha: new Date(2026, 5, 12), estadoPago: 'impago' },
      ]).stub,
    )
    // historial global: c1 solo p1 (rank 1); c2 tiene p0 (mayo) + p2 → p2 es rank 2
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'p1', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'impago' },
        { id: 'p0', clienteId: 'c2', fecha: new Date(2026, 4, 1), estadoPago: 'impago' },
        { id: 'p2', clienteId: 'c2', fecha: new Date(2026, 5, 12), estadoPago: 'impago' },
      ]).stub,
    )

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA })

    expect(result.primerosPedidos).toBe(1) // p1 es rank 1
    expect(result.recompras).toBe(1) // p2 es rank 2
    expect(result.consolidados).toBe(0) // ningún pedido pagado
  })

  it('(d) consolidados usa SOLO pedidos pagados para calcular el rank 3', async () => {
    // aperturas → []
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // pedidosRango → p3 pagado, en rango
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'p3', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'pagado' }]).stub,
    )
    // historial global de c1: pagados p1, p2, p3 + un impago intercalado.
    // Rank entre PAGADOS: p1=1, p2=2, p3=3 → consolidado.
    // Si se contara el impago, p3 sería rank 4 (no consolidaría) → demuestra que
    // solo se usan los pagados.
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'p1', clienteId: 'c1', fecha: new Date(2026, 4, 1), estadoPago: 'pagado' },
        { id: 'imp', clienteId: 'c1', fecha: new Date(2026, 4, 10), estadoPago: 'impago' },
        { id: 'p2', clienteId: 'c1', fecha: new Date(2026, 4, 15), estadoPago: 'pagado' },
        { id: 'p3', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'pagado' },
      ]).stub,
    )

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA })

    expect(result.consolidados).toBe(1)
    // p3 entre TODOS los pedidos es rank 4 → cuenta como recompra, no primer pedido
    expect(result.primerosPedidos).toBe(0)
    expect(result.recompras).toBe(1)
  })

  it('(e-territorio) con territorioId consulta directo (sin resolver gerente) y devuelve datos', async () => {
    // aperturas → 1 cliente del territorio
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1' }]).stub)
    // aperturasConPedido → ninguno
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    // pedidosRango → ninguno
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA, territorioId: TERRITORIO_UUID })

    expect(result.aperturas).toBe(1)
    expect(result.aperturasConPedido).toBe(0)
    // No hay query extra de territorioGerente → 3 llamadas
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('(e-gerente) con gerenteId resuelve sus territorios primero y luego consulta', async () => {
    // territorioGerente → 1 territorio
    mockSelect.mockReturnValueOnce(makeChain([{ territorioId: TERRITORIO_UUID }]).stub)
    // aperturas → 1 cliente
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1' }]).stub)
    // aperturasConPedido → c1
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }]).stub)
    // pedidosRango → ninguno
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA, gerenteId: GERENTE_UUID })

    expect(result.aperturas).toBe(1)
    expect(result.aperturasConPedido).toBe(1)
    // territorioGerente + aperturas + conPedido + pedidosRango = 4
    expect(mockSelect).toHaveBeenCalledTimes(4)
  })

  it('(e-gerente sin territorios) devuelve todo en cero sin consultar clientes ni pedidos', async () => {
    // territorioGerente → []
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getEmbudo({
      desde: DESDE,
      hasta: HASTA,
      gerenteId: GERENTE_SIN_TERRITORIOS_UUID,
    })

    expect(result).toEqual({
      aperturas: 0,
      aperturasConPedido: 0,
      primerosPedidos: 0,
      recompras: 0,
      consolidados: 0,
    })
    // Solo 1 llamada: la de territorioGerente
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('(e-vendedor) con vendedorId aplica un WHERE en la query de aperturas y agrega datos correctamente', async () => {
    const aperturasChain = makeChain([{ id: 'c1' }])
    mockSelect.mockReturnValueOnce(aperturasChain.stub)
    // aperturasConPedido → c1
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }]).stub)
    // pedidosRango → p1 del vendedor (rank 1)
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'p1', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'pagado' }]).stub,
    )
    // historial global de c1
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'p1', clienteId: 'c1', fecha: new Date(2026, 5, 10), estadoPago: 'pagado' }]).stub,
    )

    const result = await getEmbudo({ desde: DESDE, hasta: HASTA, vendedorId: VENDEDOR_UUID })

    expect(result.aperturas).toBe(1)
    expect(result.aperturasConPedido).toBe(1)
    expect(result.primerosPedidos).toBe(1)
    // La query de aperturas construyó un WHERE (incluye creadoPor = vendedorId)
    expect(aperturasChain.whereFn).toHaveBeenCalledTimes(1)
  })
})

// ─── Route tests ──────────────────────────────────────────────────────────────

describe('GET /api/admin/embudo — validación', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('(f) responde 400 sin fechas', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 con fecha mal formada (no YYYY-MM-DD)', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-6-8&hasta=2026-06-15')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 con fecha imposible (2026-02-30)', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-02-30&hasta=2026-03-15')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 cuando hasta <= desde', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-06-15&hasta=2026-06-15')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 cuando el rango supera 92 días', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-01-01&hasta=2026-12-31')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 con territorioId inválido (no UUID)', async () => {
    const req = new NextRequest(
      'http://localhost/api/admin/embudo?desde=2026-06-08&hasta=2026-06-15&territorioId=no-es-uuid',
    )
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('(f) responde 400 con vendedorId inválido (no UUID)', async () => {
    const req = new NextRequest(
      'http://localhost/api/admin/embudo?desde=2026-06-08&hasta=2026-06-15&vendedorId=not-a-uuid',
    )
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(400)
  })

  it('responde 200 con { data: EmbudoStats } cuando los parámetros son válidos', async () => {
    // aperturas → [] ; pedidosRango → [] (conPedido e historial se omiten)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-06-08&hasta=2026-06-15')
    const res = await getEmbudoRoute(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown }
    expect(body.data).toEqual({
      aperturas: 0,
      aperturasConPedido: 0,
      primerosPedidos: 0,
      recompras: 0,
      consolidados: 0,
    })
  })

  it('responde 401 cuando no hay sesión', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/admin/embudo?desde=2026-06-08&hasta=2026-06-15')
    const res = await getEmbudoRoute(req)
    expect(res.status).toBe(401)
  })
})

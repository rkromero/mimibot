/**
 * Tests for getCohortesSemanales / getClientesEnRiesgo and their routes.
 *
 * Pattern (same as tests/admin/dashboard-kpis.test.ts): mock @/db (select chain)
 * and auth helpers; the real service logic runs. System time is frozen so the
 * "last N weeks" and "días sin pedido" computations are deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockAuth, mockRequireAdmin } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('@/db', () => ({ db: { select: mockSelect } }))

vi.mock('@/db/schema', () => ({
  pedidos: {
    id: 'pedidos.id',
    clienteId: 'pedidos.clienteId',
    fecha: 'pedidos.fecha',
    vendedorId: 'pedidos.vendedorId',
    estadoPago: 'pedidos.estadoPago',
    deletedAt: 'pedidos.deletedAt',
    territorioIdImputado: 'pedidos.territorioIdImputado',
    $inferSelect: {},
  },
  territorioGerente: {
    territorioId: 'territorioGerente.territorioId',
    gerenteId: 'territorioGerente.gerenteId',
    $inferSelect: {},
  },
  clientes: {
    id: 'clientes.id',
    nombre: 'clientes.nombre',
    apellido: 'clientes.apellido',
    asignadoA: 'clientes.asignadoA',
    territorioId: 'clientes.territorioId',
    createdAt: 'clientes.createdAt',
    deletedAt: 'clientes.deletedAt',
    creadoPor: 'clientes.creadoPor',
    $inferSelect: {},
  },
  users: {
    id: 'users.id',
    name: 'users.name',
    email: 'users.email',
    $inferSelect: {},
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))

import { getCohortesSemanales, getClientesEnRiesgo } from '@/lib/admin/embudo.service'
import { GET as getCohortesRoute } from '@/app/api/admin/embudo/cohortes/route'
import { GET as getRiesgoRoute } from '@/app/api/admin/embudo/riesgo/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChain(resolvedValue: unknown) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  return { stub: { from: fromFn }, whereFn, fromFn }
}

const ADMIN_SESSION = {
  user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const TERRITORIO_UUID = '11111111-1111-1111-1111-111111111111'
const GERENTE_UUID = '22222222-2222-2222-2222-222222222222'
const VENDEDOR_UUID = '33333333-3333-3333-3333-333333333333'
const GERENTE_SIN_TERRITORIOS_UUID = '44444444-4444-4444-4444-444444444444'

// ─── Cohortes semanales ───────────────────────────────────────────────────────

describe('getCohortesSemanales', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    // Miércoles 10 jun 2026 → lunes de la semana actual = 8 jun 2026.
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('(a) devuelve exactamente N semanas con el lunes correcto y conPedido <= creados', async () => {
    // creadosRows: clientes con createdAt en distintas semanas
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'c1', createdAt: new Date(2026, 5, 10) }, // semana 8 jun
        { id: 'c2', createdAt: new Date(2026, 5, 9) }, // semana 8 jun
        { id: 'c3', createdAt: new Date(2026, 5, 2) }, // semana 1 jun
        { id: 'c4', createdAt: new Date(2026, 4, 20) }, // semana 18 may
      ]).stub,
    )
    // conPedido: c1 y c3 tienen pedido
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }, { clienteId: 'c3' }]).stub)

    const result = await getCohortesSemanales({ semanas: 4 })

    expect(result).toHaveLength(4)
    expect(result.map((r) => r.semanaInicio)).toEqual([
      '2026-05-18',
      '2026-05-25',
      '2026-06-01',
      '2026-06-08',
    ])
    // semana 8 jun (idx 3): 2 creados, 1 con pedido
    expect(result[3]).toEqual({ semanaInicio: '2026-06-08', creados: 2, conPedido: 1 })
    // semana 1 jun (idx 2): 1 creado, 1 con pedido
    expect(result[2]).toEqual({ semanaInicio: '2026-06-01', creados: 1, conPedido: 1 })
    // semana 25 may (idx 1): vacía
    expect(result[1]).toEqual({ semanaInicio: '2026-05-25', creados: 0, conPedido: 0 })
    // semana 18 may (idx 0): 1 creado, 0 con pedido
    expect(result[0]).toEqual({ semanaInicio: '2026-05-18', creados: 1, conPedido: 0 })
    // Invariante global
    expect(result.every((r) => r.conPedido <= r.creados)).toBe(true)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('cliente creado hace 3 semanas con pedido cuenta en el conPedido de SU cohorte de creación', async () => {
    // c1 creado el 1 jun (hace ~1.5 semanas respecto al 10 jun → cohorte 1 jun)
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1', createdAt: new Date(2026, 5, 1) }]).stub)
    // c1 tiene un pedido (de cualquier fecha)
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }]).stub)

    const result = await getCohortesSemanales({ semanas: 4 })

    const cohorteCreacion = result.find((r) => r.semanaInicio === '2026-06-01')
    expect(cohorteCreacion).toEqual({ semanaInicio: '2026-06-01', creados: 1, conPedido: 1 })
  })

  it('respeta N (devuelve la cantidad de semanas pedida)', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // sin clientes → no consulta conPedido
    const result = await getCohortesSemanales({ semanas: 6 })
    expect(result).toHaveLength(6)
    expect(result[5]!.semanaInicio).toBe('2026-06-08') // la última es la semana actual
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('(e) gerente con territorios: resuelve primero territorioGerente', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ territorioId: TERRITORIO_UUID }]).stub) // territorioGerente
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1', createdAt: new Date(2026, 5, 10) }]).stub) // creados
    mockSelect.mockReturnValueOnce(makeChain([{ clienteId: 'c1' }]).stub) // conPedido

    const result = await getCohortesSemanales({ semanas: 4, gerenteId: GERENTE_UUID })

    expect(result).toHaveLength(4)
    expect(result[3]!.creados).toBe(1)
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('(e) gerente sin territorios: 4 semanas en cero, sin consultar clientes', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // territorioGerente → []

    const result = await getCohortesSemanales({ semanas: 4, gerenteId: GERENTE_SIN_TERRITORIOS_UUID })

    expect(result).toHaveLength(4)
    expect(result.every((r) => r.creados === 0 && r.conPedido === 0)).toBe(true)
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('(e) territorioId: consulta directo (sin territorioGerente)', async () => {
    mockSelect.mockReturnValueOnce(makeChain([{ id: 'c1', createdAt: new Date(2026, 5, 10) }]).stub)
    mockSelect.mockReturnValueOnce(makeChain([]).stub)

    const result = await getCohortesSemanales({ semanas: 4, territorioId: TERRITORIO_UUID })

    expect(result[3]!.creados).toBe(1)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })
})

// ─── Clientes en riesgo ───────────────────────────────────────────────────────

describe('getClientesEnRiesgo', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    // Hoy = 12 jun 2026
    vi.setSystemTime(new Date(2026, 5, 12, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('(b) cliente con 3+ pedidos NO aparece en riesgo', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'c1', nombre: 'Juan', apellido: 'Pérez', asignadoA: 'u1' }]).stub,
    )
    // 3 pedidos (todos viejos) → excluido por cantidad
    mockSelect.mockReturnValueOnce(
      makeChain([
        { clienteId: 'c1', fecha: new Date(2026, 2, 1), vendedorId: 'v1' },
        { clienteId: 'c1', fecha: new Date(2026, 2, 15), vendedorId: 'v1' },
        { clienteId: 'c1', fecha: new Date(2026, 3, 1), vendedorId: 'v1' },
      ]).stub,
    )

    const result = await getClientesEnRiesgo({ diasSinPedido: 14 })

    expect(result).toEqual([])
    // No se consulta users (no hubo clientes en riesgo)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('(c) cliente con 2 pedidos y último hace 20 días aparece con diasSinPedido correcto', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'c1', nombre: 'Juan', apellido: 'Pérez', asignadoA: 'u1' }]).stub,
    )
    mockSelect.mockReturnValueOnce(
      makeChain([
        { clienteId: 'c1', fecha: new Date(2026, 3, 1), vendedorId: 'v1' },
        { clienteId: 'c1', fecha: new Date(2026, 4, 23), vendedorId: 'v2' }, // último: 23 may → 20 días
      ]).stub,
    )
    // users: nombre del vendedor del último pedido (v2)
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'v2', name: 'Vendedor Dos', email: 'v2@test.com' }]).stub,
    )

    const result = await getClientesEnRiesgo({ diasSinPedido: 14 })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'c1',
      nombre: 'Juan',
      apellido: 'Pérez',
      cantidadPedidos: 2,
      fechaUltimoPedido: '2026-05-23',
      diasSinPedido: 20,
      vendedorNombre: 'Vendedor Dos',
    })
    expect(mockSelect).toHaveBeenCalledTimes(3)
  })

  it('(d) cliente con último pedido hace menos del umbral NO aparece', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([{ id: 'c1', nombre: 'Ana', apellido: 'Gómez', asignadoA: null }]).stub,
    )
    mockSelect.mockReturnValueOnce(
      makeChain([
        { clienteId: 'c1', fecha: new Date(2026, 4, 1), vendedorId: 'v1' },
        { clienteId: 'c1', fecha: new Date(2026, 5, 2), vendedorId: 'v1' }, // 2 jun → 10 días < 14
      ]).stub,
    )

    const result = await getClientesEnRiesgo({ diasSinPedido: 14 })

    expect(result).toEqual([])
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('ordena por días sin pedido descendente y usa asignadoA como fallback de vendedor', async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'c1', nombre: 'Juan', apellido: 'Pérez', asignadoA: 'u1' },
        { id: 'c2', nombre: 'Ana', apellido: 'Gómez', asignadoA: 'u2' },
      ]).stub,
    )
    mockSelect.mockReturnValueOnce(
      makeChain([
        { clienteId: 'c1', fecha: new Date(2026, 4, 23), vendedorId: 'v1' }, // 20 días
        { clienteId: 'c2', fecha: new Date(2026, 3, 13), vendedorId: 'v2' }, // 60 días
      ]).stub,
    )
    // users: sólo asignadoA (u1,u2) y vendedores (v1,v2) — v's no devueltos → fallback asignadoA
    mockSelect.mockReturnValueOnce(
      makeChain([
        { id: 'u1', name: 'Asignado Uno', email: 'u1@test.com' },
        { id: 'u2', name: 'Asignado Dos', email: 'u2@test.com' },
      ]).stub,
    )

    const result = await getClientesEnRiesgo({ diasSinPedido: 14 })

    expect(result.map((r) => r.id)).toEqual(['c2', 'c1']) // c2 (60d) antes que c1 (20d)
    // v1/v2 no están en users → cae a asignadoA
    expect(result[0]!.vendedorNombre).toBe('Asignado Dos')
    expect(result[1]!.vendedorNombre).toBe('Asignado Uno')
  })

  it('(e) gerente sin territorios: devuelve [] sin consultar clientes', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // territorioGerente → []
    const result = await getClientesEnRiesgo({ diasSinPedido: 14, gerenteId: GERENTE_SIN_TERRITORIOS_UUID })
    expect(result).toEqual([])
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('(e) territorioId: filtra candidatos (consulta directa, sin territorioGerente)', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // candidatos → [] (DB filtró por territorio)
    const result = await getClientesEnRiesgo({ diasSinPedido: 14, territorioId: TERRITORIO_UUID })
    expect(result).toEqual([])
    // candidatos vacío → no consulta pedidos
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })
})

// ─── Route validation ──────────────────────────────────────────────────────────

describe('GET /api/admin/embudo/cohortes — validación', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('(f) 400 con semanas inválido', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/cohortes?semanas=0')
    expect((await getCohortesRoute(req)).status).toBe(400)
  })

  it('(f) 400 con semanas no numérico', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/cohortes?semanas=abc')
    expect((await getCohortesRoute(req)).status).toBe(400)
  })

  it('(f) 400 con territorioId inválido', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/cohortes?territorioId=nope')
    expect((await getCohortesRoute(req)).status).toBe(400)
  })

  it('200 con parámetros válidos (default 4 semanas)', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // creados → []
    const req = new NextRequest('http://localhost/api/admin/embudo/cohortes')
    const res = await getCohortesRoute(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(4)
  })

  it('401 sin sesión', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/admin/embudo/cohortes')
    expect((await getCohortesRoute(req)).status).toBe(401)
  })
})

describe('GET /api/admin/embudo/riesgo — validación', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('(f) 400 con diasSinPedido inválido (0)', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/riesgo?diasSinPedido=0')
    expect((await getRiesgoRoute(req)).status).toBe(400)
  })

  it('(f) 400 con diasSinPedido fuera de rango (>365)', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/riesgo?diasSinPedido=999')
    expect((await getRiesgoRoute(req)).status).toBe(400)
  })

  it('(f) 400 con vendedorId inválido', async () => {
    const req = new NextRequest('http://localhost/api/admin/embudo/riesgo?vendedorId=not-a-uuid')
    expect((await getRiesgoRoute(req)).status).toBe(400)
  })

  it('200 con parámetros válidos (default 14 días)', async () => {
    mockSelect.mockReturnValueOnce(makeChain([]).stub) // candidatos → []
    const req = new NextRequest(`http://localhost/api/admin/embudo/riesgo?vendedorId=${VENDEDOR_UUID}`)
    const res = await getRiesgoRoute(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })
})

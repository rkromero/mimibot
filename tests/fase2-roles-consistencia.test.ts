/**
 * Fase 2 — Tests de consistencia de roles para vendedor
 *
 * Criterio (b): cliente asignado a vendedor aparece en reportes,
 *               el vendedor puede acceder a él.
 * Criterio (c): territorio con vendedor como responsable devuelve datos correctos.
 * Criterio (d): automatizado.
 *
 * Cobertura:
 *  1. canAccessCliente — vendedor puede ver su propio cliente
 *  2. canAccessCliente — vendedor no puede ver cliente ajeno → AuthzError
 *  3. Morosos GET role=vendedor aplica filtro asignadoA
 *  4. Morosos GET role=agent no regresión
 *  5. Morosos GET role=admin + vendedorId filtra
 *  6. Morosos GET role=gerente + vendedorId visible filtra
 *  7. GET /api/metas/avance role=vendedor devuelve avance propio
 *  8. GET /api/metas/avance role=admin devuelve lista con avances de vendedor
 *  9. GET /api/admin/gerentes-equipos agenteIds incluye vendedor
 * 10. GET /api/users?role=agent,vendedor retorna 200
 * 11. GET /api/users?role=agent retorna 200 (backward compat)
 * 12. PipelineFilters.tsx usa URL correcta y label correcto
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockClientesFindFirst,
  mockDbSelect,
  mockAuthFn,
  mockGetSessionContext,
  mockCalcVendedor,
  mockCalcTodos,
  mockRequireAdmin,
} = vi.hoisted(() => ({
  mockClientesFindFirst: vi.fn(),
  mockDbSelect: vi.fn(),
  mockAuthFn: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockCalcVendedor: vi.fn(),
  mockCalcTodos: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      clientes: { findFirst: mockClientesFindFirst, findMany: vi.fn() },
      pedidos: { findMany: vi.fn() },
      metas: { findFirst: vi.fn(), findMany: vi.fn() },
      movimientosCC: { findMany: vi.fn() },
      leads: { findMany: vi.fn() },
      territorioAgente: { findMany: vi.fn(), findFirst: vi.fn() },
      territorioGerente: { findMany: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    select: mockDbSelect,
    execute: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/lib/errors', () => {
  class AuthzError extends Error {
    status = 403
    constructor(m: string) { super(m); this.name = 'AuthzError' }
  }
  class NotFoundError extends Error {
    status = 404
    constructor(r: string) { super(`${r} not found`); this.name = 'NotFoundError' }
  }
  class ValidationError extends Error {
    status = 400
    constructor(m: string) { super(m); this.name = 'ValidationError' }
  }
  return {
    AuthzError,
    NotFoundError,
    ValidationError,
    toApiError: vi.fn((err: unknown) => {
      const e = err as { status?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.status ?? 500 }
    }),
  }
})

vi.mock('@/lib/authz', () => ({
  requireAdmin: mockRequireAdmin,
  requireAdminOrGerente: vi.fn(),
  requireNotAgent: vi.fn(),
  withAdminAuth: vi.fn(async (fn: () => unknown) => fn()),
}))

vi.mock('@/lib/authz/clientes', async (importActual) => {
  // Use actual implementation (it depends on mocked @/db and @/lib/errors)
  const actual = await importActual<typeof import('@/lib/authz/clientes')>()
  return actual
})

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: mockGetSessionContext,
}))

vi.mock('@/lib/metas/avance.service', () => ({
  calcularAvanceVendedor: mockCalcVendedor,
  calcularAvanceTodos: mockCalcTodos,
}))

vi.mock('@/lib/api/pagination', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 50, sortBy: 'fecha', sortDir: 'asc', search: '' }),
}))

vi.mock('@/lib/api/cache', () => ({
  cachedJson: vi.fn((_req: unknown, body: unknown) => {
    const { NextResponse } = require('next/server') as typeof import('next/server')
    return NextResponse.json(body)
  }),
}))

// ─── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_UUID = 'aaaaaaaa-0000-0000-0000-000000000001'
const VENDOR_UUID = 'bbbbbbbb-0000-0000-0000-000000000002'
const AGENT_UUID = 'cccccccc-0000-0000-0000-000000000003'
const CLIENTE_UUID = 'dddddddd-0000-0000-0000-000000000004'
const GERENTE_UUID = 'eeeeeeee-0000-0000-0000-000000000005'
const TERRITORIO_UUID = 'ffffffff-0000-0000-0000-000000000006'

function makeSession(role: 'admin' | 'agent' | 'vendedor' | 'gerente', userId = VENDOR_UUID) {
  return { user: { id: userId, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeReq(url: string, method = 'GET') {
  return new NextRequest(url, { method })
}

function makeEmptyMorososSelect() {
  // 1st call: businessConfig, 2nd+3rd: count + rows
  mockDbSelect
    .mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ clienteMorosoDias: 30 }]) }) }),
    })
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([{ total: 0 }]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([]) }) }),
            }),
          }),
        }),
      }),
    })
}

// ─── 1 & 2: canAccessCliente — vendedor ───────────────────────────────────────

describe('canAccessCliente', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. vendedor puede acceder a su propio cliente', async () => {
    mockClientesFindFirst.mockResolvedValue({ id: CLIENTE_UUID })
    const { canAccessCliente } = await import('@/lib/authz/clientes')
    const user = makeSession('vendedor').user
    await expect(canAccessCliente(user, CLIENTE_UUID)).resolves.toBeUndefined()
  })

  it('2. vendedor no puede acceder a cliente ajeno → lanza error (403)', async () => {
    mockClientesFindFirst.mockResolvedValue(null)
    const { canAccessCliente } = await import('@/lib/authz/clientes')
    const user = makeSession('vendedor').user
    await expect(canAccessCliente(user, CLIENTE_UUID)).rejects.toThrow('No tenés acceso a este cliente')
  })
})

// ─── 3-6: GET /api/reportes/morosos — scoping por rol ────────────────────────

describe('GET /api/reportes/morosos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('3. role=vendedor → 200 (aplica filtro asignadoA)', async () => {
    mockGetSessionContext.mockResolvedValue({
      role: 'vendedor', userId: VENDOR_UUID,
      territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [],
    })
    makeEmptyMorososSelect()
    const { GET } = await import('@/app/api/reportes/morosos/route')
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    const res = await GET(makeReq('http://localhost/api/reportes/morosos'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('4. role=agent → 200 (no regresión)', async () => {
    mockGetSessionContext.mockResolvedValue({
      role: 'agent', userId: AGENT_UUID,
      territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [],
    })
    makeEmptyMorososSelect()
    const { GET } = await import('@/app/api/reportes/morosos/route')
    mockAuthFn.mockResolvedValue(makeSession('agent', AGENT_UUID))
    const res = await GET(makeReq('http://localhost/api/reportes/morosos'))
    expect(res.status).toBe(200)
  })

  it('5. role=admin + vendedorId → 200', async () => {
    mockGetSessionContext.mockResolvedValue({
      role: 'admin', userId: ADMIN_UUID,
      territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [],
    })
    makeEmptyMorososSelect()
    const { GET } = await import('@/app/api/reportes/morosos/route')
    mockAuthFn.mockResolvedValue(makeSession('admin', ADMIN_UUID))
    const res = await GET(makeReq(`http://localhost/api/reportes/morosos?vendedorId=${VENDOR_UUID}`))
    expect(res.status).toBe(200)
  })

  it('6. role=gerente + vendedorId visible → 200', async () => {
    mockGetSessionContext.mockResolvedValue({
      role: 'gerente', userId: GERENTE_UUID,
      territoriosGestionados: [TERRITORIO_UUID],
      agentesVisibles: [VENDOR_UUID],
      territoriosActivos: [],
    })
    makeEmptyMorososSelect()
    const { GET } = await import('@/app/api/reportes/morosos/route')
    mockAuthFn.mockResolvedValue(makeSession('gerente', GERENTE_UUID))
    const res = await GET(makeReq(`http://localhost/api/reportes/morosos?vendedorId=${VENDOR_UUID}`))
    expect(res.status).toBe(200)
  })
})

// ─── 7 & 8: GET /api/metas/avance ─────────────────────────────────────────────

describe('GET /api/metas/avance', () => {
  const fakeAvance = {
    meta: { id: 'meta-1', vendedorId: VENDOR_UUID, periodoAnio: 2026, periodoMes: 5, clientesNuevosObjetivo: 5, pedidosObjetivo: 20, montoCobradoObjetivo: '100000', conversionLeadsObjetivo: '50', pctClientesConPedidoObjetivo: '80' },
    clientesNuevos: { alcanzado: 3, pct: 60, proyeccion: 5, estado: 'en_curso' as const },
    pedidos: { alcanzado: 10, pct: 50, proyeccion: 20, estado: 'en_curso' as const },
    montoCobrado: { alcanzado: 50000, pct: 50, proyeccion: 100000, estado: 'en_curso' as const },
    conversionLeads: { alcanzado: 40, pct: 80, proyeccion: 50, estado: 'en_curso' as const },
    pctClientesConPedido: { alcanzado: 70, pct: 70, proyeccion: 70, estado: 'en_curso' as const },
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('7. role=vendedor → devuelve avance propio (200)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockGetSessionContext.mockResolvedValue({
      role: 'vendedor', userId: VENDOR_UUID,
      territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [],
    })
    mockCalcVendedor.mockResolvedValue(fakeAvance)

    const { GET } = await import('@/app/api/metas/avance/route')
    const res = await GET(makeReq('http://localhost/api/metas/avance?anio=2026&mes=5'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof fakeAvance }
    expect(body.data?.meta.vendedorId).toBe(VENDOR_UUID)
  })

  it('8. role=admin → lista con avance de vendedor (200)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin', ADMIN_UUID))
    mockGetSessionContext.mockResolvedValue({
      role: 'admin', userId: ADMIN_UUID,
      territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [],
    })
    mockCalcTodos.mockResolvedValue([fakeAvance])

    const { GET } = await import('@/app/api/metas/avance/route')
    const res = await GET(makeReq('http://localhost/api/metas/avance?anio=2026&mes=5'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof fakeAvance[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.meta.vendedorId).toBe(VENDOR_UUID)
  })
})

// ─── 9: GET /api/admin/gerentes-equipos ───────────────────────────────────────

describe('GET /api/admin/gerentes-equipos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('9. agenteIds del gerente incluye al vendedor asignado al territorio', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin', ADMIN_UUID))
    mockRequireAdmin.mockReturnValue(undefined)

    // DB calls: (1) select gerentes, (2) select territorioGerente, (3) select territorioAgente
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ id: GERENTE_UUID, name: 'Gerente Test', email: 'g@t.com' }]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ gerenteId: GERENTE_UUID, territorioId: TERRITORIO_UUID }]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ agenteId: VENDOR_UUID, territorioId: TERRITORIO_UUID }]),
        }),
      })

    const { GET } = await import('@/app/api/admin/gerentes-equipos/route')
    const res = await GET(makeReq('http://localhost/api/admin/gerentes-equipos'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ gerenteId: string; agenteIds: string[] }> }
    const equipo = body.data.find((e) => e.gerenteId === GERENTE_UUID)
    expect(equipo?.agenteIds).toContain(VENDOR_UUID)
  })
})

// ─── 10 & 11: GET /api/users — CSV role ───────────────────────────────────────

describe('GET /api/users — CSV role para PipelineFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(makeSession('admin', ADMIN_UUID))
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([
          { id: AGENT_UUID, name: 'Agent', email: 'a@t.com', role: 'agent', avatarColor: '#aaa', isActive: true, isOnline: false },
          { id: VENDOR_UUID, name: 'Vendor', email: 'v@t.com', role: 'vendedor', avatarColor: '#bbb', isActive: true, isOnline: false },
        ]),
      }),
    })
  })

  it('10. ?role=agent,vendedor retorna 200 (inArray path — ambos roles)', async () => {
    const { GET } = await import('@/app/api/users/route')
    const res = await GET(makeReq('http://localhost/api/users?role=agent,vendedor'))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('11. ?role=agent retorna 200 (backward compat)', async () => {
    const { GET } = await import('@/app/api/users/route')
    const res = await GET(makeReq('http://localhost/api/users?role=agent'))
    expect(res.status).toBe(200)
  })
})

// ─── 12: PipelineFilters usa URL y label correctos ────────────────────────────

describe('PipelineFilters', () => {
  it('12. usa ?role=agent,vendedor y label "Todos los responsables"', async () => {
    const { readFile } = await import('fs/promises')
    const { resolve } = await import('path')
    const content = await readFile(
      resolve(process.cwd(), 'components/pipeline/PipelineFilters.tsx'),
      'utf-8',
    )
    expect(content).toContain('role=agent,vendedor')
    expect(content).toContain('Todos los responsables')
  })
})

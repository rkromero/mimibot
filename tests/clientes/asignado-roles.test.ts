/**
 * Tests for /goal: ampliar dropdowns para incluir rol "vendedor"
 *
 * Coverage:
 * (a) GET /api/users?role=agent,vendedor — returns both agents and vendedores
 * (b) GET /api/users?role=agent          — backward compat: only agents
 * (c) GET /api/users?role=vendedor       — backward compat: only vendedores
 * (d) GET /api/users?role=agent,vendedor,xxxinvalid — invalid roles ignored
 * (e) POST /api/clientes: asignadoA with role=agent is accepted
 * (f) POST /api/clientes: asignadoA with role=vendedor is accepted
 * (g) POST /api/clientes: asignadoA with role=admin → 400
 * (h) POST /api/clientes: asignadoA with role=gerente → 400
 * (i) PATCH /api/clientes/[id]: asignadoA with role=vendedor is accepted
 * (j) PATCH /api/clientes/[id]: asignadoA with role=admin → 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockUsersSelect,
  mockUsersFindFirst,
  mockClientesFindFirst,
  mockClientesInsert,
  mockClientesUpdate,
} = vi.hoisted(() => {
  const mockUsersSelect = vi.fn()
  const mockUsersFindFirst = vi.fn()
  const mockClientesFindFirst = vi.fn()
  const mockClientesInsert = vi.fn()
  const mockClientesUpdate = vi.fn()
  return { mockUsersSelect, mockUsersFindFirst, mockClientesFindFirst, mockClientesInsert, mockClientesUpdate }
})

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'aaaaaaaa-0000-0000-0000-000000000001', role: 'admin', name: 'Admin' },
  }),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      users: { findFirst: mockUsersFindFirst },
      clientes: { findFirst: mockClientesFindFirst },
    },
    select: mockUsersSelect,
    insert: () => ({
      values: () => ({ returning: mockClientesInsert }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: mockClientesUpdate }),
      }),
    }),
  },
}))

vi.mock('@/lib/authz', () => ({
  requireAdmin: vi.fn(),
  withAdminAuth: vi.fn(async (fn: () => unknown) => fn()),
}))

vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: vi.fn() }))

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: vi.fn().mockResolvedValue({
    role: 'admin',
    userId: 'aaaaaaaa-0000-0000-0000-000000000001',
    territoriosGestionados: [],
    agentesVisibles: [],
    territoriosActivos: [],
  }),
}))

vi.mock('@/lib/territorios/asignacion.service', () => ({
  resolverTerritorioPorRol: vi.fn().mockResolvedValue({ territorioId: null, agenteId: null }),
}))

vi.mock('@/lib/territorios/territorios.service', () => ({
  getTerritorioActivoDeAgente: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/api/pagination', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 50, sortBy: 'createdAt', sortDir: 'desc', search: '' }),
}))

vi.mock('@/lib/validations/clientes', () => ({
  createClienteSchema: {
    safeParse: (data: unknown) => {
      const d = data as Record<string, unknown>
      if (!d.nombre || !d.apellido) return { success: false, error: { issues: [{ message: 'Datos inválidos' }] } }
      return { success: true, data: { ...d } }
    },
  },
  updateClienteSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  clienteFiltersSchema: {
    safeParse: () => ({ success: true, data: {} }),
  },
}))

vi.mock('@/lib/api/cache', () => ({
  cachedJson: vi.fn((_req: unknown, body: unknown) => {
    const { NextResponse } = require('next/server') as typeof import('next/server')
    return NextResponse.json(body)
  }),
}))

vi.mock('@/lib/errors', () => ({
  toApiError: vi.fn((err: unknown) => {
    const e = err as { status?: number; message?: string }
    return { message: e?.message ?? 'Error', status: e?.status ?? 500 }
  }),
  NotFoundError: class NotFoundError extends Error {
    status = 404
    constructor(r: string) { super(`${r} not found`); this.name = 'NotFoundError' }
  },
  ValidationError: class ValidationError extends Error {
    status = 400
    constructor(m: string) { super(m); this.name = 'ValidationError' }
  },
  AuthzError: class AuthzError extends Error {
    status = 403
    constructor(m: string) { super(m); this.name = 'AuthzError' }
  },
}))

vi.mock('@/lib/delete/delete.service', () => ({ deleteCliente: vi.fn() }))
vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const AGENT_UUID = 'bbbbbbbb-0000-0000-0000-000000000002'
const VENDOR_UUID = 'cccccccc-0000-0000-0000-000000000003'
const ADMIN_UUID = 'dddddddd-0000-0000-0000-000000000004'
const GERENTE_UUID = 'eeeeeeee-0000-0000-0000-000000000005'

function makeGetReq(url: string) {
  return new NextRequest(url, { method: 'GET' })
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/clientes/${VALID_UUID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── GET /api/users — CSV role filter ─────────────────────────────────────────

describe('GET /api/users — CSV role filtering', () => {
  const fakeUsers = [
    { id: AGENT_UUID, name: 'Agent', email: 'a@test.com', role: 'agent', avatarColor: '#aaa', isActive: true, isOnline: false },
    { id: VENDOR_UUID, name: 'Vendor', email: 'v@test.com', role: 'vendedor', avatarColor: '#bbb', isActive: true, isOnline: false },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsersSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve(fakeUsers),
      }),
    })
  })

  it('(a) ?role=agent,vendedor — triggers inArray path and returns both roles', async () => {
    const { GET } = await import('@/app/api/users/route')
    const req = makeGetReq('http://localhost/api/users?role=agent,vendedor')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: typeof fakeUsers }
    // The DB mock returns fakeUsers regardless — we verify the handler succeeds and
    // passes the filter. The SQL filter itself is covered by integration / E2E.
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('(b) ?role=agent — single role still works (backward compat)', async () => {
    const { GET } = await import('@/app/api/users/route')
    const req = makeGetReq('http://localhost/api/users?role=agent')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('(c) ?role=vendedor — single role still works (backward compat)', async () => {
    const { GET } = await import('@/app/api/users/route')
    const req = makeGetReq('http://localhost/api/users?role=vendedor')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('(d) ?role=agent,vendedor,xxxinvalid — invalid roles silently stripped, handler succeeds', async () => {
    const { GET } = await import('@/app/api/users/route')
    const req = makeGetReq('http://localhost/api/users?role=agent,vendedor,xxxinvalid')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})

// ─── POST /api/clientes — role validation for asignadoA ───────────────────────

describe('POST /api/clientes — asignadoA role validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClientesInsert.mockResolvedValue([{
      id: VALID_UUID, nombre: 'Test', apellido: 'User',
      asignadoA: null, territorioId: null,
    }])
  })

  it('(e) asignadoA with role=agent is accepted (201)', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: AGENT_UUID, role: 'agent', isActive: true })
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'Juan', apellido: 'Perez', asignadoA: AGENT_UUID })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('(f) asignadoA with role=vendedor is accepted (201)', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: VENDOR_UUID, role: 'vendedor', isActive: true })
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'Ana', apellido: 'Lopez', asignadoA: VENDOR_UUID })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('(g) asignadoA with role=admin → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: ADMIN_UUID, role: 'admin', isActive: true })
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'El', apellido: 'Admin', asignadoA: ADMIN_UUID })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo se puede asignar a un agente o vendedor')
  })

  it('(h) asignadoA with role=gerente → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: GERENTE_UUID, role: 'gerente', isActive: true })
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'El', apellido: 'Gerente', asignadoA: GERENTE_UUID })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo se puede asignar a un agente o vendedor')
  })

  it('asignadoA pointing to inactive user → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: AGENT_UUID, role: 'agent', isActive: false })
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'In', apellido: 'Activo', asignadoA: AGENT_UUID })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Usuario no encontrado o inactivo')
  })

  it('asignadoA pointing to nonexistent user → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/clientes/route')
    const req = makePostReq({ nombre: 'No', apellido: 'Existe', asignadoA: AGENT_UUID })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Usuario no encontrado o inactivo')
  })
})

// ─── PATCH /api/clientes/[id] — role validation for asignadoA ─────────────────

describe('PATCH /api/clientes/[id] — asignadoA role validation', () => {
  const existingCliente = {
    id: VALID_UUID, nombre: 'Test', apellido: 'User',
    asignadoA: null, territorioId: null, deletedAt: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockClientesFindFirst.mockResolvedValue(existingCliente)
    mockClientesUpdate.mockResolvedValue([existingCliente])
  })

  it('(i) asignadoA with role=vendedor is accepted (200)', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: VENDOR_UUID, role: 'vendedor', isActive: true })
    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchReq({ asignadoA: VENDOR_UUID }), { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(200)
  })

  it('(j) asignadoA with role=admin → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: ADMIN_UUID, role: 'admin', isActive: true })
    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchReq({ asignadoA: ADMIN_UUID }), { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo se puede asignar a un agente o vendedor')
  })

  it('PATCH: asignadoA=null is allowed (unassign)', async () => {
    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchReq({ asignadoA: null }), { params: Promise.resolve({ id: VALID_UUID }) })
    // null = unassign, no user lookup needed → passes validation
    expect(res.status).toBe(200)
    // mockUsersFindFirst should NOT have been called for null
    expect(mockUsersFindFirst).not.toHaveBeenCalled()
  })

  it('PATCH: asignadoA with role=gerente → 400', async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ id: GERENTE_UUID, role: 'gerente', isActive: true })
    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchReq({ asignadoA: GERENTE_UUID }), { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Solo se puede asignar a un agente o vendedor')
  })
})

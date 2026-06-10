/**
 * Tests: POST /api/clientes — validación extra para rol 'agent'
 *
 * Cobertura:
 *  1. Schema: createClienteAgentSchema rechaza telefono vacío
 *  2. Schema: createClienteAgentSchema rechaza codigoPostal vacío
 *  3. Schema: createClienteAgentSchema acepta ambos campos presentes
 *  4. Schema: createClienteSchema base sigue aceptando sin telefono/cp (otros roles)
 *  5. Route: agente SIN telefono → 400 con field=telefono
 *  6. Route: agente SIN codigoPostal → 400 con field=codigoPostal
 *  7. Route: agente CON ambos campos → 201
 *  8. Route: admin SIN telefono/cp → 201 (sigue funcionando)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createClienteSchema, createClienteAgentSchema } from '@/lib/validations/clientes'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuthFn, mockGetCtx, mockDbInsert, mockDbQuery } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockGetCtx: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbQuery: { users: { findFirst: vi.fn() }, clientes: { findFirst: vi.fn() } },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetCtx }))
vi.mock('@/lib/territorios/asignacion.service', () => ({
  resolverTerritorioPorRol: vi.fn().mockResolvedValue({ territorioId: null, agenteId: null }),
}))
vi.mock('@/lib/territorios/territorios.service', () => ({
  getTerritorioActivoDeAgente: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/geo/geocode.service', () => ({ geocodeClienteIfNeeded: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/errors', () => ({
  toApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string }
    return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
  },
}))

vi.mock('@/db', () => ({
  db: {
    insert: mockDbInsert,
    query: mockDbQuery,
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_CLIENTE = {
  nombre: 'Juan',
  apellido: 'Pérez',
}

function makeAgentSession() {
  return { user: { id: 'agent-1', role: 'agent', name: 'Agente', email: 'a@b.com', avatarColor: '#aaa' } }
}

function makeAgentCtx() {
  return { role: 'agent', userId: 'agent-1', territoriosGestionados: [], agentesVisibles: [] }
}

function makeAdminCtx() {
  return { role: 'admin', userId: 'admin-1', territoriosGestionados: [], agentesVisibles: [] }
}

function makeInsertChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  mockDbInsert.mockReturnValue({ values: mockValues })
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/clientes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Schema unit tests ────────────────────────────────────────────────────────

describe('createClienteAgentSchema — validación de campos requeridos', () => {
  it('1. rechaza telefono vacío', () => {
    const result = createClienteAgentSchema.safeParse({ ...BASE_CLIENTE, telefono: '', codigoPostal: '1234' })
    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.path[0] === 'telefono')
    expect(issue).toBeDefined()
    expect(issue?.message).toMatch(/teléfono/i)
  })

  it('2. rechaza codigoPostal vacío', () => {
    const result = createClienteAgentSchema.safeParse({ ...BASE_CLIENTE, telefono: '+5491112345678', codigoPostal: '' })
    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.path[0] === 'codigoPostal')
    expect(issue).toBeDefined()
    expect(issue?.message).toMatch(/postal/i)
  })

  it('3. rechaza ambos vacíos y reporta los dos campos', () => {
    const result = createClienteAgentSchema.safeParse({ ...BASE_CLIENTE, telefono: '', codigoPostal: '' })
    expect(result.success).toBe(false)
    const paths = result.error?.issues.map((i) => i.path[0])
    expect(paths).toContain('telefono')
    expect(paths).toContain('codigoPostal')
  })

  it('4. acepta cuando ambos están presentes', () => {
    const result = createClienteAgentSchema.safeParse({
      ...BASE_CLIENTE,
      telefono: '+5491112345678',
      codigoPostal: '1234',
    })
    expect(result.success).toBe(true)
  })
})

describe('createClienteSchema base — otros roles', () => {
  it('5. sigue aceptando sin telefono y sin codigoPostal', () => {
    const result = createClienteSchema.safeParse(BASE_CLIENTE)
    expect(result.success).toBe(true)
  })
})

// ─── Route tests ──────────────────────────────────────────────────────────────

describe('POST /api/clientes — rol agent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('6. agente sin telefono → 400 con field=telefono', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockGetCtx.mockResolvedValue(makeAgentCtx())

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makeRequest({ ...BASE_CLIENTE, codigoPostal: '1234' }))

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; field?: string }
    expect(body.field).toBe('telefono')
    expect(body.error).toMatch(/teléfono/i)
  })

  it('7. agente sin codigoPostal → 400 con field=codigoPostal', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockGetCtx.mockResolvedValue(makeAgentCtx())

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makeRequest({ ...BASE_CLIENTE, telefono: '+5491112345678' }))

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; field?: string }
    expect(body.field).toBe('codigoPostal')
    expect(body.error).toMatch(/postal/i)
  })

  it('8. agente con ambos campos → 201', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockGetCtx.mockResolvedValue(makeAgentCtx())
    makeInsertChain([{ id: 'new-cliente-1', ...BASE_CLIENTE, telefono: '+5491112345678', codigoPostal: '1234' }])

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makeRequest({ ...BASE_CLIENTE, telefono: '+5491112345678', codigoPostal: '1234' }))

    expect(res.status).toBe(201)
    const body = await res.json() as { data: { id: string } }
    expect(body.data.id).toBe('new-cliente-1')
  })
})

describe('POST /api/clientes — otros roles (sin restricción extra)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('9. admin sin telefono ni codigoPostal → 201', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'admin-1', role: 'admin', name: 'Admin', email: 'adm@b.com', avatarColor: '#bbb' } })
    mockGetCtx.mockResolvedValue(makeAdminCtx())
    makeInsertChain([{ id: 'new-cliente-2', ...BASE_CLIENTE }])

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makeRequest(BASE_CLIENTE))

    expect(res.status).toBe(201)
  })
})

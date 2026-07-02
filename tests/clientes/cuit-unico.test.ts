/**
 * Tests: CUIT único global entre clientes activos
 *
 * Cobertura:
 *  1-5. normalizeCuit: trim, vacío/espacios → null, null → null, undefined → undefined
 *  6-9. Schemas: transform de cuit en create y update
 *  10.  POST con CUIT usado por otro cliente activo → 409 + clienteExistente, no inserta
 *  11.  POST con CUIT libre → 201, inserta el cuit normalizado (trim)
 *  12.  POST con CUIT de solo espacios → no consulta duplicados, inserta null
 *  13.  PATCH con CUIT usado por otro cliente activo → 409 + clienteExistente, no actualiza
 *  14.  PATCH con CUIT libre → 200, actualiza con el cuit normalizado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { normalizeCuit, createClienteSchema, updateClienteSchema } from '@/lib/validations/clientes'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuthFn, mockGetCtx, mockDbInsert, mockDbUpdate, mockDbQuery } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockGetCtx: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
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
vi.mock('@/lib/authz', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/delete/delete.service', () => ({ deleteCliente: vi.fn() }))
vi.mock('@/lib/errors', () => ({
  toApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string }
    return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
  },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404
    constructor(resource = 'Recurso') {
      super(`${resource} no encontrado`)
    }
  },
}))

vi.mock('@/db', () => ({
  db: {
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: mockDbQuery,
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111'
const OTRO_CLIENTE = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Ana', apellido: 'García' }
const CUIT = '20-12345678-9'

function makeAdminSession() {
  return { user: { id: 'admin-1', role: 'admin', name: 'Admin', email: 'adm@b.com', avatarColor: '#bbb' } }
}

function makeAdminCtx() {
  return { role: 'admin', userId: 'admin-1', territoriosGestionados: [], agentesVisibles: [] }
}

function makeInsertChain() {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'new-cliente-1' }])
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  mockDbInsert.mockReturnValue({ values: mockValues })
  return mockValues
}

function makeUpdateChain() {
  const mockReturning = vi.fn().mockResolvedValue([{ id: CLIENTE_ID }])
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return mockSet
}

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/clientes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makePatchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/clientes/${CLIENTE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── normalizeCuit ────────────────────────────────────────────────────────────

describe('normalizeCuit', () => {
  it('1. hace trim del valor', () => {
    expect(normalizeCuit(`  ${CUIT}  `)).toBe(CUIT)
  })

  it('2. string vacío → null', () => {
    expect(normalizeCuit('')).toBeNull()
  })

  it('3. solo espacios → null', () => {
    expect(normalizeCuit('   ')).toBeNull()
  })

  it('4. null → null', () => {
    expect(normalizeCuit(null)).toBeNull()
  })

  it('5. undefined se preserva (PATCH: no tocar el campo)', () => {
    expect(normalizeCuit(undefined)).toBeUndefined()
  })
})

// ─── Schemas ──────────────────────────────────────────────────────────────────

describe('schemas de cliente — transform de cuit', () => {
  it('6. createClienteSchema normaliza con trim', () => {
    const result = createClienteSchema.safeParse({ nombre: 'Juan', apellido: 'Pérez', cuit: `  ${CUIT} ` })
    expect(result.success).toBe(true)
    expect(result.data?.cuit).toBe(CUIT)
  })

  it('7. createClienteSchema convierte espacios/"" a null', () => {
    const result = createClienteSchema.safeParse({ nombre: 'Juan', apellido: 'Pérez', cuit: '   ' })
    expect(result.success).toBe(true)
    expect(result.data?.cuit).toBeNull()
  })

  it('8. updateClienteSchema convierte "" a null', () => {
    const result = updateClienteSchema.safeParse({ cuit: '' })
    expect(result.success).toBe(true)
    expect(result.data?.cuit).toBeNull()
  })

  it('9. updateClienteSchema preserva undefined si el campo no viene', () => {
    const result = updateClienteSchema.safeParse({ nombre: 'Juan' })
    expect(result.success).toBe(true)
    expect(result.data?.cuit).toBeUndefined()
  })
})

// ─── POST /api/clientes ───────────────────────────────────────────────────────

describe('POST /api/clientes — CUIT duplicado', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('10. CUIT usado por otro cliente activo → 409 con clienteExistente, no inserta', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockGetCtx.mockResolvedValue(makeAdminCtx())
    mockDbQuery.clientes.findFirst.mockResolvedValue(OTRO_CLIENTE)

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({ nombre: 'Juan', apellido: 'Pérez', cuit: CUIT }))

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; clienteExistente?: { id: string; nombre: string } }
    expect(body.error).toBe('Ya existe un cliente con ese CUIT')
    expect(body.clienteExistente).toEqual({ id: OTRO_CLIENTE.id, nombre: 'Ana García' })
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('11. CUIT libre → 201 e inserta el cuit normalizado', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockGetCtx.mockResolvedValue(makeAdminCtx())
    mockDbQuery.clientes.findFirst.mockResolvedValue(undefined)
    const mockValues = makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({ nombre: 'Juan', apellido: 'Pérez', cuit: `  ${CUIT} ` }))

    expect(res.status).toBe(201)
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ cuit: CUIT }))
  })

  it('12. CUIT de solo espacios → no consulta duplicados e inserta null', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockGetCtx.mockResolvedValue(makeAdminCtx())
    const mockValues = makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({ nombre: 'Juan', apellido: 'Pérez', cuit: '   ' }))

    expect(res.status).toBe(201)
    expect(mockDbQuery.clientes.findFirst).not.toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ cuit: null }))
  })
})

// ─── PATCH /api/clientes/[id] ─────────────────────────────────────────────────

describe('PATCH /api/clientes/[id] — CUIT duplicado', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('13. CUIT usado por otro cliente activo → 409 con clienteExistente, no actualiza', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockDbQuery.clientes.findFirst
      .mockResolvedValueOnce({ id: CLIENTE_ID, nombre: 'Juan', apellido: 'Pérez' }) // current
      .mockResolvedValueOnce(OTRO_CLIENTE) // duplicado

    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchRequest({ cuit: CUIT }), { params: Promise.resolve({ id: CLIENTE_ID }) })

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; clienteExistente?: { id: string; nombre: string } }
    expect(body.error).toBe('Ya existe un cliente con ese CUIT')
    expect(body.clienteExistente).toEqual({ id: OTRO_CLIENTE.id, nombre: 'Ana García' })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('14. CUIT libre → 200 y actualiza con el cuit normalizado', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockDbQuery.clientes.findFirst
      .mockResolvedValueOnce({ id: CLIENTE_ID, nombre: 'Juan', apellido: 'Pérez' }) // current
      .mockResolvedValueOnce(undefined) // sin duplicado
    const mockSet = makeUpdateChain()

    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchRequest({ cuit: `  ${CUIT} ` }), { params: Promise.resolve({ id: CLIENTE_ID }) })

    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ cuit: CUIT }))
  })
})

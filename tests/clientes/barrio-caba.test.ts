/**
 * Tests: barrio de clientes + regla CABA
 *
 * Cobertura:
 *  1-6. esProvinciaCABA: variantes CABA (case-insensitive, con/sin tilde), no-CABA, null
 *  7.   POST provincia CABA sin barrio → 400 con mensaje claro, no inserta
 *  8.   POST variante "ciudad autónoma de buenos aires" sin barrio → 400
 *  9.   POST CABA con barrio → 201; inserta barrio y localidad normalizada a CABA
 *  10.  POST provincia no-CABA sin barrio → 201 (barrio opcional)
 *  11.  PATCH que pasa provincia a CABA sin barrio (cliente sin barrio) → 400, no actualiza
 *  12.  PATCH que borra el barrio siendo CABA → 400
 *  13.  PATCH CABA con barrio → 200; actualiza barrio y normaliza localidad vacía
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { esProvinciaCABA, LOCALIDAD_CABA } from '@/lib/validations/clientes'

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

// ─── esProvinciaCABA ──────────────────────────────────────────────────────────

describe('esProvinciaCABA', () => {
  it('1. "CABA" → true', () => {
    expect(esProvinciaCABA('CABA')).toBe(true)
  })

  it('2. "caba" (case-insensitive) → true', () => {
    expect(esProvinciaCABA('caba')).toBe(true)
  })

  it('3. "Ciudad Autónoma de Buenos Aires" → true', () => {
    expect(esProvinciaCABA('Ciudad Autónoma de Buenos Aires')).toBe(true)
  })

  it('4. "ciudad autonoma de buenos aires" (sin tilde) → true', () => {
    expect(esProvinciaCABA('ciudad autonoma de buenos aires')).toBe(true)
  })

  it('5. "Buenos Aires" → false', () => {
    expect(esProvinciaCABA('Buenos Aires')).toBe(false)
  })

  it('6. null / undefined / vacío → false', () => {
    expect(esProvinciaCABA(null)).toBe(false)
    expect(esProvinciaCABA(undefined)).toBe(false)
    expect(esProvinciaCABA('  ')).toBe(false)
  })
})

// ─── POST /api/clientes ───────────────────────────────────────────────────────

describe('POST /api/clientes — barrio obligatorio en CABA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockGetCtx.mockResolvedValue(makeAdminCtx())
  })

  it('7. provincia CABA sin barrio → 400 con mensaje claro, no inserta', async () => {
    makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({ nombre: 'Juan', apellido: 'Pérez', provincia: 'CABA' }))

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('El barrio es obligatorio para clientes de CABA')
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('8. variante "ciudad autónoma de buenos aires" sin barrio → 400', async () => {
    makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({
      nombre: 'Juan', apellido: 'Pérez', provincia: 'ciudad autónoma de buenos aires',
    }))

    expect(res.status).toBe(400)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('9. CABA con barrio → 201; inserta barrio y normaliza localidad vacía a CABA', async () => {
    const mockValues = makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({
      nombre: 'Juan', apellido: 'Pérez', provincia: 'CABA', barrio: '  Palermo  ',
    }))

    expect(res.status).toBe(201)
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
      barrio: 'Palermo',
      localidad: LOCALIDAD_CABA,
      provincia: 'CABA',
    }))
  })

  it('10. provincia no-CABA sin barrio → 201 (barrio opcional)', async () => {
    const mockValues = makeInsertChain()

    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(makePostRequest({
      nombre: 'Juan', apellido: 'Pérez', provincia: 'Córdoba', localidad: 'Villa María',
    }))

    expect(res.status).toBe(201)
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
      barrio: null,
      localidad: 'Villa María',
    }))
  })
})

// ─── PATCH /api/clientes/[id] ─────────────────────────────────────────────────

describe('PATCH /api/clientes/[id] — barrio obligatorio en CABA (estado efectivo)', () => {
  const params = { params: Promise.resolve({ id: CLIENTE_ID }) }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockGetCtx.mockResolvedValue(makeAdminCtx())
  })

  it('11. pasar provincia a CABA sin barrio (cliente sin barrio) → 400, no actualiza', async () => {
    mockDbQuery.clientes.findFirst.mockResolvedValue({
      id: CLIENTE_ID, provincia: 'Buenos Aires', barrio: null, localidad: 'Lanús',
    })
    makeUpdateChain()

    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchRequest({ provincia: 'CABA' }), params)

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('El barrio es obligatorio para clientes de CABA')
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('12. borrar el barrio siendo CABA → 400', async () => {
    mockDbQuery.clientes.findFirst.mockResolvedValue({
      id: CLIENTE_ID, provincia: 'CABA', barrio: 'Palermo', localidad: LOCALIDAD_CABA,
    })
    makeUpdateChain()

    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchRequest({ barrio: '' }), params)

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('13. CABA con barrio → 200; actualiza barrio y normaliza localidad vacía', async () => {
    mockDbQuery.clientes.findFirst.mockResolvedValue({
      id: CLIENTE_ID, provincia: 'Buenos Aires', barrio: null, localidad: null,
    })
    const mockSet = makeUpdateChain()

    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    const res = await PATCH(makePatchRequest({ provincia: 'CABA', barrio: 'Caballito' }), params)

    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      provincia: 'CABA',
      barrio: 'Caballito',
      localidad: LOCALIDAD_CABA,
    }))
  })
})

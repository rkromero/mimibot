/**
 * Tests: módulo Control > Gastos (/api/admin/gastos) — solo admin
 *
 * Cobertura:
 *  1-2. rangoMesAR: límites del mes en horario AR; mes inválido → null
 *  3.   GET sin sesión → 401
 *  4.   POST con rol gerente → 403 (requireAdmin real)
 *  5.   POST admin válido → 201; inserta monto formateado, fecha AR y registradoPor
 *  6.   POST monto inválido (<= 0) → 400
 *  7.   POST categoría inexistente/inactiva → 400
 *  8.   POST categoría duplicada → 409
 *  9.   DELETE → soft-delete (deletedAt), 200
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { rangoMesAR } from '@/lib/dates'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuthFn, mockDbInsert, mockDbUpdate, mockDbQuery } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbQuery: {
    gastoCategorias: { findFirst: vi.fn(), findMany: vi.fn() },
    gastos: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({
  db: {
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: mockDbQuery,
  },
}))
// requireAdmin y toApiError se usan REALES: un gerente debe recibir el 403 verdadero.

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIA_ID = '11111111-1111-4111-8111-111111111111'
const GASTO_ID = '22222222-2222-4222-8222-222222222222'

function makeSession(role: string) {
  return { user: { id: 'user-1', role, name: 'U', email: 'u@b.com', avatarColor: '#aaa' } }
}

function makeInsertChain() {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'nuevo-1' }])
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  mockDbInsert.mockReturnValue({ values: mockValues })
  return mockValues
}

function makeUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue([])
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return mockSet
}

function makePostRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const GASTO_VALIDO = {
  fecha: '2026-07-02',
  categoriaId: CATEGORIA_ID,
  monto: 1234.5,
  descripcion: '25 kg chocolate semiamargo',
  proveedor: 'Distribuidora Cacao',
  metodoPago: 'transferencia',
}

// ─── rangoMesAR ───────────────────────────────────────────────────────────────

describe('rangoMesAR', () => {
  it('1. devuelve [inicio, fin) del mes en horario AR (UTC-3)', () => {
    const rango = rangoMesAR('2026-07')!
    expect(rango.desde.toISOString()).toBe('2026-07-01T03:00:00.000Z')
    expect(rango.hasta.toISOString()).toBe('2026-08-01T03:00:00.000Z')

    // Diciembre cruza el año
    const dic = rangoMesAR('2026-12')!
    expect(dic.hasta.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it('2. mes inválido → null', () => {
    expect(rangoMesAR('2026-13')).toBeNull()
    expect(rangoMesAR('julio')).toBeNull()
    expect(rangoMesAR('2026-7')).toBeNull()
  })
})

// ─── Rutas ────────────────────────────────────────────────────────────────────

describe('/api/admin/gastos — authz y CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('3. GET sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)

    const { GET } = await import('@/app/api/admin/gastos/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/gastos?mes=2026-07'))

    expect(res.status).toBe(401)
  })

  it('4. POST con rol gerente → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('gerente'))
    makeInsertChain()

    const { POST } = await import('@/app/api/admin/gastos/route')
    const res = await POST(makePostRequest('http://localhost/api/admin/gastos', GASTO_VALIDO))

    expect(res.status).toBe(403)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('5. POST admin válido → 201 con monto formateado, fecha AR y registradoPor', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockDbQuery.gastoCategorias.findFirst.mockResolvedValue({ id: CATEGORIA_ID })
    const mockValues = makeInsertChain()

    const { POST } = await import('@/app/api/admin/gastos/route')
    const res = await POST(makePostRequest('http://localhost/api/admin/gastos', GASTO_VALIDO))

    expect(res.status).toBe(201)
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
      categoriaId: CATEGORIA_ID,
      monto: '1234.50',
      descripcion: '25 kg chocolate semiamargo',
      proveedor: 'Distribuidora Cacao',
      metodoPago: 'transferencia',
      registradoPor: 'user-1',
    }))
    const fecha = (mockValues.mock.calls[0]![0] as { fecha: Date }).fecha
    expect(fecha.toISOString()).toBe('2026-07-02T03:00:00.000Z')
  })

  it('6. POST monto <= 0 → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    makeInsertChain()

    const { POST } = await import('@/app/api/admin/gastos/route')
    const res = await POST(makePostRequest('http://localhost/api/admin/gastos', { ...GASTO_VALIDO, monto: 0 }))

    expect(res.status).toBe(400)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('7. POST con categoría inexistente → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockDbQuery.gastoCategorias.findFirst.mockResolvedValue(undefined)
    makeInsertChain()

    const { POST } = await import('@/app/api/admin/gastos/route')
    const res = await POST(makePostRequest('http://localhost/api/admin/gastos', GASTO_VALIDO))

    expect(res.status).toBe(400)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('8. POST categoría con nombre duplicado → 409', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockDbQuery.gastoCategorias.findFirst.mockResolvedValue({ id: 'existente' })
    makeInsertChain()

    const { POST } = await import('@/app/api/admin/gastos/categorias/route')
    const res = await POST(makePostRequest('http://localhost/api/admin/gastos/categorias', {
      nombre: 'Materia Prima',
      tipo: 'costo_directo',
    }))

    expect(res.status).toBe(409)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('9. DELETE → soft-delete con deletedAt', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockDbQuery.gastos.findFirst.mockResolvedValue({ id: GASTO_ID })
    const mockSet = makeUpdateChain()

    const { DELETE } = await import('@/app/api/admin/gastos/[id]/route')
    const res = await DELETE(
      new NextRequest(`http://localhost/api/admin/gastos/${GASTO_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: GASTO_ID }) },
    )

    expect(res.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }))
  })
})

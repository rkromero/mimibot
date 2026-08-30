import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ConflictError, ValidationError } from '@/lib/errors'

const { mockAuthFn, mockRequireAdmin, mockListar, mockCrear, mockActualizar, mockDuplicar } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockListar: vi.fn(),
  mockCrear: vi.fn(),
  mockActualizar: vi.fn(),
  mockDuplicar: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/cotizador/recetas.service', () => ({
  listarRecetas: mockListar,
  crearReceta: mockCrear,
  actualizarReceta: mockActualizar,
  duplicarReceta: mockDuplicar,
}))

const RECETA_ID = '5a1b2c3d-0000-4000-8000-00000000000a'
const CLIENTE_ID = '5a1b2c3d-0000-4000-8000-00000000000b'
const INSUMO_ID = '5a1b2c3d-0000-4000-8000-00000000000c'

const SESSION = { user: { id: 'u1', role: 'admin', name: 'Admin', email: 'a@a.com' } }

function jsonReq(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue(SESSION)
})

describe('GET /api/admin/cotizador/recetas — filtros', () => {
  it('pasa clienteId / esCotizador / generales al service', async () => {
    mockListar.mockResolvedValue([])
    const { GET } = await import('@/app/api/admin/cotizador/recetas/route')
    const res = await GET(new NextRequest(`http://x/api/admin/cotizador/recetas?clienteId=${CLIENTE_ID}&esCotizador=true`))
    expect(res.status).toBe(200)
    expect(mockListar).toHaveBeenCalledWith({ clienteId: CLIENTE_ID, esCotizador: true, generales: false })
  })

  it('clienteId no-uuid → 400 sin tocar el service', async () => {
    const { GET } = await import('@/app/api/admin/cotizador/recetas/route')
    const res = await GET(new NextRequest('http://x/api/admin/cotizador/recetas?clienteId=zzz'))
    expect(res.status).toBe(400)
    expect(mockListar).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/cotizador/recetas', () => {
  const VALIDO = { nombre: 'Alfajor 60g', gramaje: 60, items: [{ insumoId: INSUMO_ID, cantidad: 38.5 }] }

  it('esCotizador + clienteId → 400 y no crea', async () => {
    const { POST } = await import('@/app/api/admin/cotizador/recetas/route')
    const res = await POST(jsonReq('http://x/api/admin/cotizador/recetas', { ...VALIDO, esCotizador: true, clienteId: CLIENTE_ID }))
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('Una receta del cotizador no puede pertenecer a un cliente')
    expect(mockCrear).not.toHaveBeenCalled()
  })

  it('gramaje duplicado del cotizador → 409 (ConflictError del service)', async () => {
    mockCrear.mockRejectedValue(new ConflictError('Ya existe una receta activa del cotizador de 60 g'))
    const { POST } = await import('@/app/api/admin/cotizador/recetas/route')
    const res = await POST(jsonReq('http://x/api/admin/cotizador/recetas', { ...VALIDO, esCotizador: true }))
    const body = await res.json() as { error: string }
    expect(res.status).toBe(409)
    expect(body.error).toContain('60 g')
  })

  it('válido → 201 con la receta (y su costo) del service', async () => {
    mockCrear.mockResolvedValue({ id: RECETA_ID, nombre: 'Alfajor 60g', costo: { costoUnitario: 410.03 } })
    const { POST } = await import('@/app/api/admin/cotizador/recetas/route')
    const res = await POST(jsonReq('http://x/api/admin/cotizador/recetas', VALIDO))
    const body = await res.json() as { data: { costo: { costoUnitario: number } } }
    expect(res.status).toBe(201)
    expect(body.data.costo.costoUnitario).toBe(410.03)
    expect(mockCrear).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Alfajor 60g', esCotizador: false, clienteId: null,
    }))
  })
})

describe('PATCH /api/admin/cotizador/recetas/[id]', () => {
  it('el service rechaza el estado efectivo cotizador+cliente → 400', async () => {
    mockActualizar.mockRejectedValue(new ValidationError('Una receta del cotizador no puede pertenecer a un cliente'))
    const { PATCH } = await import('@/app/api/admin/cotizador/recetas/[id]/route')
    const res = await PATCH(
      jsonReq(`http://x/api/admin/cotizador/recetas/${RECETA_ID}`, { esCotizador: true }, 'PATCH'),
      { params: Promise.resolve({ id: RECETA_ID }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/cotizador/recetas/[id]/duplicar', () => {
  it('clona vía service y devuelve 201 con esCotizador false', async () => {
    mockDuplicar.mockResolvedValue({ id: 'nueva', esCotizador: false, clienteId: CLIENTE_ID })
    const { POST } = await import('@/app/api/admin/cotizador/recetas/[id]/duplicar/route')
    const res = await POST(
      jsonReq(`http://x/api/admin/cotizador/recetas/${RECETA_ID}/duplicar`, { clienteId: CLIENTE_ID, nombre: 'Copia' }),
      { params: Promise.resolve({ id: RECETA_ID }) },
    )
    const body = await res.json() as { data: { esCotizador: boolean; clienteId: string } }
    expect(res.status).toBe(201)
    expect(body.data.esCotizador).toBe(false)
    expect(body.data.clienteId).toBe(CLIENTE_ID)
    expect(mockDuplicar).toHaveBeenCalledWith(RECETA_ID, { clienteId: CLIENTE_ID, nombre: 'Copia' })
  })

  it('sin clienteId → 400 sin duplicar', async () => {
    const { POST } = await import('@/app/api/admin/cotizador/recetas/[id]/duplicar/route')
    const res = await POST(
      jsonReq(`http://x/api/admin/cotizador/recetas/${RECETA_ID}/duplicar`, { nombre: 'Copia' }),
      { params: Promise.resolve({ id: RECETA_ID }) },
    )
    expect(res.status).toBe(400)
    expect(mockDuplicar).not.toHaveBeenCalled()
  })
})

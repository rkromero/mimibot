import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn, mockFindProducto, mockFindReceta, mockFindMarca, mockUpdate, mockCostear } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockFindProducto: vi.fn(),
  mockFindReceta: vi.fn(),
  mockFindMarca: vi.fn(),
  mockUpdate: vi.fn(),
  mockCostear: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/authz/marcas', () => ({ assertPuedeVerMarca: vi.fn() }))
vi.mock('@/lib/delete/delete.service', () => ({ deleteProducto: vi.fn() }))
vi.mock('@/lib/productos/costeo.service', () => ({ costearProducto: mockCostear }))
vi.mock('@/db', () => ({
  db: {
    query: {
      productos: { findFirst: mockFindProducto },
      recetas: { findFirst: mockFindReceta },
      marcas: { findFirst: mockFindMarca },
    },
    update: mockUpdate,
  },
}))

const PRODUCTO_ID = '5a1b2c3d-0000-4000-8000-00000000000a'
const RECETA_ID = '5a1b2c3d-0000-4000-8000-00000000000b'

function patchReq(body: unknown) {
  return new NextRequest(`http://x/api/productos/${PRODUCTO_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function updateChain(row: Record<string, unknown>) {
  return { set: () => ({ where: () => ({ returning: () => Promise.resolve([row]) }) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', name: 'A', email: 'a@a.com' } })
  mockCostear.mockResolvedValue(null)
})

describe('PATCH /api/productos/[id] — costo bloqueado con receta (FASE 1D)', () => {
  it('producto con receta + costo a mano → 400 sin actualizar', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: RECETA_ID })
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(patchReq({ costo: '450.00' }), { params: Promise.resolve({ id: PRODUCTO_ID }) })
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('El costo se calcula desde la receta: no se puede cargar a mano')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('enlazar receta en el mismo PATCH que manda costo → 400 (estado efectivo)', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: null })
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(
      patchReq({ recetaId: RECETA_ID, costo: '450.00' }),
      { params: Promise.resolve({ id: PRODUCTO_ID }) },
    )
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('desenlazar la receta y mandar costo en el mismo PATCH → permitido', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: RECETA_ID })
    mockUpdate.mockReturnValue(updateChain({ id: PRODUCTO_ID, recetaId: null, costo: '450.00' }))
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(
      patchReq({ recetaId: null, costo: '450.00' }),
      { params: Promise.resolve({ id: PRODUCTO_ID }) },
    )
    const body = await res.json() as { data: { costeo: unknown } }
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(body.data.costeo).toBeNull()
  })

  it('enlazar una receta inexistente o inactiva → 400', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: null })
    mockFindReceta.mockResolvedValue(undefined)
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(patchReq({ recetaId: RECETA_ID }), { params: Promise.resolve({ id: PRODUCTO_ID }) })
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('Receta inválida o inactiva')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('enlazar receta activa → 200 con costeo del service', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: null })
    mockFindReceta.mockResolvedValue({ id: RECETA_ID })
    mockUpdate.mockReturnValue(updateChain({ id: PRODUCTO_ID, recetaId: RECETA_ID }))
    mockCostear.mockResolvedValue({ costoUnitario: 410.03, margen: { valor: 35, origen: 'global' } })
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(patchReq({ recetaId: RECETA_ID }), { params: Promise.resolve({ id: PRODUCTO_ID }) })
    const body = await res.json() as { data: { costeo: { costoUnitario: number } } }
    expect(res.status).toBe(200)
    expect(body.data.costeo.costoUnitario).toBe(410.03)
  })

  it('producto sin receta: costo manual sigue permitido', async () => {
    mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, recetaId: null })
    mockUpdate.mockReturnValue(updateChain({ id: PRODUCTO_ID, recetaId: null, costo: '450.00' }))
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    const res = await PATCH(patchReq({ costo: '450.00' }), { params: Promise.resolve({ id: PRODUCTO_ID }) })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })
})

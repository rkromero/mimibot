import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { propuestas } from '@/db/schema'

const {
  mockAuthFn, mockCanAccessLead, mockFindFirst, mockUpdate, mockInsert, mockDelete, mockSelect,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead, requireAdmin: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: { propuestas: { findFirst: mockFindFirst } },
    update: mockUpdate,
    insert: mockInsert,
    delete: mockDelete,
    select: mockSelect,
  },
}))
// El PDF y el envío se mockean: acá solo interesa el manejo de 404 de la ruta
vi.mock('@/lib/pdf/propuesta.service', () => ({ generarPropuestaPdf: vi.fn() }))
vi.mock('@/lib/pdf/propuesta.template', () => ({
  formatNumeroPropuesta: (n: number) => `PROP-${String(n).padStart(5, '0')}`,
}))
vi.mock('@/lib/whatsapp/client', () => ({ uploadMediaToMeta: vi.fn(), sendMediaMessage: vi.fn() }))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: vi.fn() }))

import { listarPropuestas } from '@/lib/cotizador/propuestas.service'

const PROP_ID = '5a1b2c3d-0000-4000-8000-000000000021'

const PROPUESTA = {
  id: PROP_ID,
  numero: 7,
  leadId: 'lead-1',
  estado: 'borrador' as const,
  creadoPor: 'vend-1',
}

function makeSession(role: string, id = 'vend-1') {
  return { user: { id, role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}

function deleteReq() {
  return new NextRequest(`http://localhost/api/propuestas/${PROP_ID}`, { method: 'DELETE' })
}

type SetValues = Record<string, unknown>

function armarDbEscritura(capturas: { set: SetValues | null; activity: SetValues | null }) {
  mockUpdate.mockReturnValue({
    set: (v: SetValues) => {
      capturas.set = v
      return { where: () => Promise.resolve() }
    },
  })
  mockInsert.mockReturnValue({
    values: (v: SetValues) => {
      capturas.activity = v
      return Promise.resolve()
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanAccessLead.mockResolvedValue(undefined)
})

describe('DELETE /api/propuestas/[id] — soft delete', () => {
  it('marca deletedAt sin borrar la fila y registra la actividad', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockFindFirst.mockResolvedValue(PROPUESTA)
    const capturas: { set: SetValues | null; activity: SetValues | null } = { set: null, activity: null }
    armarDbEscritura(capturas)

    const { DELETE } = await import('@/app/api/propuestas/[id]/route')
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(200)
    // Soft delete: UPDATE con deletedAt, nunca un DELETE físico
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(capturas.set?.['deletedAt']).toBeInstanceOf(Date)
    // Actividad con número de propuesta y usuario
    expect(capturas.activity).toMatchObject({
      leadId: 'lead-1',
      userId: 'vend-1',
      action: 'propuesta_eliminada',
      metadata: { propuestaId: PROP_ID, numero: 7 },
    })
  })

  it('una propuesta ya borrada devuelve 404 (el filtro isNull la excluye)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    // findFirst filtra isNull(deletedAt): para una borrada no devuelve fila
    mockFindFirst.mockResolvedValue(undefined)

    const { DELETE } = await import('@/app/api/propuestas/[id]/route')
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/propuestas/[id] — permisos', () => {
  it('vendedor NO puede borrar una propuesta enviada: 403 con mensaje claro', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockFindFirst.mockResolvedValue({ ...PROPUESTA, estado: 'enviada' })

    const { DELETE } = await import('@/app/api/propuestas/[id]/route')
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(403)
    expect(body.error).toContain('administrador')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('vendedor SÍ puede borrar una propuesta propia en borrador', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockFindFirst.mockResolvedValue(PROPUESTA)
    const capturas: { set: SetValues | null; activity: SetValues | null } = { set: null, activity: null }
    armarDbEscritura(capturas)

    const { DELETE } = await import('@/app/api/propuestas/[id]/route')
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(200)
    expect(capturas.set?.['deletedAt']).toBeInstanceOf(Date)
  })

  it('vendedor no puede borrar una propuesta creada por otro', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor', 'vend-2'))
    mockFindFirst.mockResolvedValue(PROPUESTA)

    const { DELETE } = await import('@/app/api/propuestas/[id]/route')
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('admin puede borrar una propuesta enviada y también una en borrador', async () => {
    for (const estado of ['enviada', 'borrador'] as const) {
      vi.clearAllMocks()
      mockCanAccessLead.mockResolvedValue(undefined)
      mockAuthFn.mockResolvedValue(makeSession('admin', 'admin-1'))
      mockFindFirst.mockResolvedValue({ ...PROPUESTA, estado })
      const capturas: { set: SetValues | null; activity: SetValues | null } = { set: null, activity: null }
      armarDbEscritura(capturas)

      const { DELETE } = await import('@/app/api/propuestas/[id]/route')
      const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PROP_ID }) })

      expect(res.status).toBe(200)
      expect(capturas.set?.['deletedAt']).toBeInstanceOf(Date)
    }
  })
})

describe('propuestas borradas — invisibles para el resto del sistema', () => {
  it('el listado del lead filtra por deleted_at IS NULL', async () => {
    let capturedWhere: unknown = null
    mockSelect.mockReturnValue({
      from: () => ({
        where: (cond: unknown) => {
          capturedWhere = cond
          return { orderBy: () => Promise.resolve([]) }
        },
      }),
    })

    await listarPropuestas('lead-1')

    // La condición del WHERE tiene que referenciar la columna deleted_at
    // (identidad del objeto Column del schema)
    function referencia(node: unknown, col: unknown, visitados = new WeakSet<object>()): boolean {
      if (node === col) return true
      if (typeof node !== 'object' || node === null) return false
      if (visitados.has(node)) return false
      visitados.add(node)
      return Object.values(node).some((v) => referencia(v, col, visitados))
    }
    expect(referencia(capturedWhere, propuestas.deletedAt)).toBe(true)
  })

  it('el PDF de una propuesta borrada devuelve 404', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockFindFirst.mockResolvedValue(undefined) // el filtro isNull la excluye

    const { GET } = await import('@/app/api/propuestas/[id]/pdf/route')
    const res = await GET(
      new NextRequest(`http://localhost/api/propuestas/${PROP_ID}/pdf`),
      { params: Promise.resolve({ id: PROP_ID }) },
    )
    expect(res.status).toBe(404)
  })

  it('enviar una propuesta borrada devuelve 404', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockFindFirst.mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/propuestas/[id]/enviar/route')
    const res = await POST(
      new NextRequest(`http://localhost/api/propuestas/${PROP_ID}/enviar`, {
        method: 'POST',
        body: JSON.stringify({ via: 'email' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: PROP_ID }) },
    )
    expect(res.status).toBe(404)
  })
})

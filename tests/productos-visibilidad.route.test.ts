/**
 * Tests para GET /api/productos — el listado respeta la visibilidad por marca.
 *
 * Verifica que la ruta consulta `marcaVisibleFilter(session.user)` y aplica el
 * filtro devuelto (para ventas) en la consulta. La corrección del filtro por rol
 * se cubre en tests/marcas-authz.test.ts (marcaVisibleFilter / getMarcasVisibles).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn, mockSelect, mockMarcaVisibleFilter } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockSelect: vi.fn(),
  mockMarcaVisibleFilter: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/lib/authz/marcas', () => ({ marcaVisibleFilter: mockMarcaVisibleFilter }))
vi.mock('@/lib/authz', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/api/pagination', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 50, sortBy: 'nombre', sortDir: 'asc', search: '' }),
}))
vi.mock('@/lib/errors', () => ({
  toApiError: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string }
    return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
  },
}))

function chain(result: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'leftJoin', 'where', 'orderBy', 'limit', 'offset']) c[m] = () => c
  c['then'] = (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

function makeSession(role: string) {
  return { user: { id: 'u1', role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/productos — visibilidad por marca', () => {
  it('vendedor: consulta marcaVisibleFilter con su usuario y responde 200', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    // Ventas → el filtro devuelve una condición (se aplica al listado).
    mockMarcaVisibleFilter.mockResolvedValue({ __sql: 'marca-filter' })
    mockSelect.mockReturnValueOnce(chain([{ total: 1 }])) // count
    mockSelect.mockReturnValueOnce(chain([{ id: 'p1', nombre: 'Alfajor Mimi', marcaNombre: 'Mimi' }])) // rows

    const { GET } = await import('@/app/api/productos/route')
    const res = await GET(new NextRequest('http://localhost/api/productos?activo=true'))
    const body = await res.json() as { data: Array<{ marcaNombre: string }> }

    expect(res.status).toBe(200)
    expect(mockMarcaVisibleFilter).toHaveBeenCalledTimes(1)
    expect(mockMarcaVisibleFilter).toHaveBeenCalledWith(makeSession('vendedor').user)
    expect(body.data[0]!.marcaNombre).toBe('Mimi')
  })

  it('admin: marcaVisibleFilter devuelve undefined (sin filtro) y responde 200', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockMarcaVisibleFilter.mockResolvedValue(undefined) // admin ve todo
    mockSelect.mockReturnValueOnce(chain([{ total: 2 }]))
    mockSelect.mockReturnValueOnce(chain([
      { id: 'p1', nombre: 'Alfajor Mimi', marcaNombre: 'Mimi' },
      { id: 'p2', nombre: 'Galleta Otra', marcaNombre: 'Otra' },
    ]))

    const { GET } = await import('@/app/api/productos/route')
    const res = await GET(new NextRequest('http://localhost/api/productos'))
    const body = await res.json() as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(mockMarcaVisibleFilter).toHaveBeenCalledTimes(1)
    expect(body.data).toHaveLength(2)
  })
})

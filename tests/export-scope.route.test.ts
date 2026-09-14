/**
 * GET /api/export/[entidad] — el handler aplica el alcance por rol:
 * 403 para roles sin cartera, CSV vacío para gerente sin territorios,
 * 400 para entidades desconocidas. El detalle del alcance se cubre en
 * tests/export-scope.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn, mockSelect, mockGetSessionContext, mockMarcaVisibleFilter } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockSelect: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockMarcaVisibleFilter: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({ db: { select: mockSelect, query: {} } }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetSessionContext }))
vi.mock('@/lib/authz/marcas', () => ({ marcaVisibleFilter: mockMarcaVisibleFilter }))
vi.mock('@/lib/dates', () => ({ todayStrAR: () => '2026-08-27' }))

function chain(result: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset']) c[m] = () => c
  c['then'] = (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

function makeSession(role: string) {
  return { user: { id: 'u1', role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}

function ctx(role: string, extra: Record<string, unknown> = {}) {
  return { userId: 'u1', role, territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [], ...extra }
}

async function callExport(entidad: string) {
  const { GET } = await import('@/app/api/export/[entidad]/route')
  return GET(new NextRequest(`http://localhost/api/export/${entidad}`), { params: Promise.resolve({ entidad }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMarcaVisibleFilter.mockResolvedValue(undefined)
})

describe('GET /api/export/[entidad] — alcance por rol', () => {
  it('sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)
    const res = await callExport('clientes')
    expect(res.status).toBe(401)
  })

  it('entidad desconocida → 400 (antes de consultar nada)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockGetSessionContext.mockResolvedValue(ctx('admin'))
    const res = await callExport('usuarios')
    expect(res.status).toBe(400)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it.each(['clientes', 'pedidos', 'leads', 'morosos'])('repartidor → 403 en %s y no toca la base', async (entidad) => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockGetSessionContext.mockResolvedValue(ctx('repartidor'))
    const res = await callExport(entidad)
    expect(res.status).toBe(403)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('fabrica → 403 en clientes pero 200 en stock (filtrado por marca)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockGetSessionContext.mockResolvedValue(ctx('fabrica'))

    const denegado = await callExport('clientes')
    expect(denegado.status).toBe(403)

    mockSelect.mockReturnValueOnce(chain([]))
    const ok = await callExport('stock')
    expect(ok.status).toBe(200)
    expect(mockMarcaVisibleFilter).toHaveBeenCalledWith(makeSession('fabrica').user)
  })

  it('gerente sin territorios → 200 con sólo el encabezado, sin consultar la base', async () => {
    mockAuthFn.mockResolvedValue(makeSession('gerente'))
    mockGetSessionContext.mockResolvedValue(ctx('gerente'))
    const res = await callExport('clientes')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = await res.text()
    expect(text.replace(/^﻿/, '')).toBe('ID,Nombre,Apellido,Empresa,Email,Telefono,CUIT,Direccion,Estado,Origen,Fecha Alta\n')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('vendedor → 200 en morosos con su cartera (consulta con join a clientes)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockGetSessionContext.mockResolvedValue(ctx('vendedor'))
    mockSelect.mockReturnValueOnce(chain([{ clienteMorosoDias: 30 }])) // businessConfig
    mockSelect.mockReturnValueOnce(chain([])) // morosos
    const res = await callExport('morosos')
    expect(res.status).toBe(200)
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })
})

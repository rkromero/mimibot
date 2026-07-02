/**
 * Tests: Control > Resultado y Caja (/api/admin/finanzas/*) — solo admin
 *
 * Cobertura:
 *  1. GET resultado sin sesión → 401
 *  2. GET resultado con rol gerente → 403
 *  3. GET resultado sin mes / mes inválido → 400
 *  4. GET resultado → cuenta de resultados correcta (ventas − CD = MB − GO = neto)
 *  5. GET caja → totales por método, neto y serie semanal correctos
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuthFn, mockDbSelect } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({ db: { select: mockDbSelect } }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(role: string) {
  return { user: { id: 'user-1', role, name: 'U', email: 'u@b.com', avatarColor: '#aaa' } }
}

// Cada llamada a db.select() devuelve un chain fluido que resuelve el próximo
// resultado de la cola (en el orden en que el handler ejecuta sus queries).
function makeSelectQueue(results: unknown[][]) {
  let i = 0
  mockDbSelect.mockImplementation(() => {
    const result = results[i++] ?? []
    const chain: Record<string, unknown> = {}
    const self = () => chain
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit', 'offset']) {
      chain[m] = vi.fn(self)
    }
    chain['then'] = (resolve: (v: unknown) => void) => Promise.resolve(resolve(result))
    return chain
  })
}

function makeRequest(path: string, mes?: string) {
  const url = new URL(`http://localhost${path}`)
  if (mes) url.searchParams.set('mes', mes)
  return new NextRequest(url)
}

// ─── Resultado ────────────────────────────────────────────────────────────────

describe('GET /api/admin/finanzas/resultado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)

    const { GET } = await import('@/app/api/admin/finanzas/resultado/route')
    const res = await GET(makeRequest('/api/admin/finanzas/resultado', '2026-07'))

    expect(res.status).toBe(401)
  })

  it('2. rol gerente → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('gerente'))

    const { GET } = await import('@/app/api/admin/finanzas/resultado/route')
    const res = await GET(makeRequest('/api/admin/finanzas/resultado', '2026-07'))

    expect(res.status).toBe(403)
  })

  it('3. sin mes o mes inválido → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))

    const { GET } = await import('@/app/api/admin/finanzas/resultado/route')
    expect((await GET(makeRequest('/api/admin/finanzas/resultado'))).status).toBe(400)
    expect((await GET(makeRequest('/api/admin/finanzas/resultado', '2026-13'))).status).toBe(400)
  })

  it('4. calcula ventas − costos directos = margen bruto − gastos operativos = neto', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    makeSelectQueue([
      // mes actual: ventas, gastos por tipo
      [{ total: '100000', cantidad: 5 }],
      [{ tipo: 'costo_directo', total: '30000' }, { tipo: 'gasto_operativo', total: '20000' }],
      // mes anterior: ventas, gastos por tipo
      [{ total: '80000', cantidad: 4 }],
      [{ tipo: 'gasto_operativo', total: '10000' }],
    ])

    const { GET } = await import('@/app/api/admin/finanzas/resultado/route')
    const res = await GET(makeRequest('/api/admin/finanzas/resultado', '2026-07'))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { actual: Record<string, unknown>; anterior: Record<string, unknown> } }
    expect(body.data.actual).toEqual({
      ventas: '100000.00',
      cantidadPedidos: 5,
      costoDirecto: '30000.00',
      gastoOperativo: '20000.00',
      margenBruto: '70000.00',
      resultadoNeto: '50000.00',
    })
    expect(body.data.anterior).toMatchObject({
      ventas: '80000.00',
      costoDirecto: '0.00',
      resultadoNeto: '70000.00',
    })
  })
})

// ─── Caja ─────────────────────────────────────────────────────────────────────

describe('GET /api/admin/finanzas/caja', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('5. totales por método, neto y serie semanal', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    makeSelectQueue([
      // mes actual: ingresos por método, egresos por método
      [{ metodo: 'efectivo', total: '40000' }, { metodo: 'transferencia', total: '60000' }],
      [{ metodo: null, total: '25000' }],
      // serie semanal: ingresos, egresos
      [{ semana: '2026-06-29', total: '100000' }],
      [{ semana: '2026-06-29', total: '25000' }],
      // mes anterior: ingresos, egresos
      [],
      [],
    ])

    const { GET } = await import('@/app/api/admin/finanzas/caja/route')
    const res = await GET(makeRequest('/api/admin/finanzas/caja', '2026-07'))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      ingresos: { total: '100000.00', porMetodo: { efectivo: '40000.00', transferencia: '60000.00' } },
      egresos: { total: '25000.00', porMetodo: { sin_especificar: '25000.00' } },
      neto: '75000.00',
      porSemana: [{ semana: '2026-06-29', ingresos: '100000.00', egresos: '25000.00', neto: '75000.00' }],
    })
  })
})

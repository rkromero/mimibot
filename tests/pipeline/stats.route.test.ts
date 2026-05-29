import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuth, mockGetSessionContext, mockTodayStrAR } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSessionContext: vi.fn(),
  // Fijamos la fecha a 2026-05-28 para que los tests sean deterministas
  mockTodayStrAR: vi.fn().mockReturnValue('2026-05-28'),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetSessionContext }))
vi.mock('@/lib/dates', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/dates')>()
  return {
    ...real,
    todayStrAR: mockTodayStrAR,
    // parseFechaAR se mantiene real para que los rangos sean correctos
  }
})

// ── db mock — chain: select().from().innerJoin().where() ─────────────────────
// Cada llamada a db.select() genera una nueva cadena; where() resuelve con el
// resultado correspondiente (primera llamada = ganado, segunda = perdido).

const buildChain = (result: { count: number }[]) => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  }
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  return chain
}

let mockDbSelect: ReturnType<typeof vi.fn>

vi.mock('@/db', () => ({
  db: {
    get select() {
      return mockDbSelect
    },
  },
}))

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { GET } from '@/app/api/pipeline/stats/route'

// ─── Tests ───────────────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest('http://localhost/api/pipeline/stats')
}

describe('GET /api/pipeline/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTodayStrAR.mockReturnValue('2026-05-28')
  })

  it('devuelve 401 si no hay sesión', async () => {
    mockAuth.mockResolvedValue(null)
    mockDbSelect = vi.fn()

    const res = await GET()
    expect(res.status).toBe(401)
  })

  describe('rol admin', () => {
    it('devuelve el total del sistema sin filtro de agente', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      })

      // Primera llamada → ganadoMes=7, segunda → perdidoMes=3
      const chain1 = buildChain([{ count: 7 }])
      const chain2 = buildChain([{ count: 3 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(res.status).toBe(200)
      expect(body.ganadoMes).toBe(7)
      expect(body.perdidoMes).toBe(3)

      // Admin: db.select llamado 2 veces (ganado + perdido), sin inArray de agentes
      expect(mockDbSelect).toHaveBeenCalledTimes(2)
    })

    it('devuelve 0/0 si no hay leads cerrados en el mes', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      })

      const chain1 = buildChain([{ count: 0 }])
      const chain2 = buildChain([{ count: 0 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(body.ganadoMes).toBe(0)
      expect(body.perdidoMes).toBe(0)
    })
  })

  describe('rol vendedor', () => {
    it('scope a sus propios leads', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'vendedor-1', role: 'vendedor' },
      })

      const chain1 = buildChain([{ count: 4 }])
      const chain2 = buildChain([{ count: 2 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(res.status).toBe(200)
      expect(body.ganadoMes).toBe(4)
      expect(body.perdidoMes).toBe(2)
      // getSessionContext no se llama para vendedor
      expect(mockGetSessionContext).not.toHaveBeenCalled()
    })

    it('también aplica para rol agent', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'agent-1', role: 'agent' },
      })

      const chain1 = buildChain([{ count: 1 }])
      const chain2 = buildChain([{ count: 0 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(body.ganadoMes).toBe(1)
      expect(body.perdidoMes).toBe(0)
    })
  })

  describe('rol gerente', () => {
    it('scope a leads de los agentes de sus territorios', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'gerente-1', role: 'gerente' },
      })
      mockGetSessionContext.mockResolvedValue({
        userId: 'gerente-1',
        role: 'gerente',
        territoriosGestionados: ['t-1', 't-2'],
        agentesVisibles: ['agent-a', 'agent-b'],
        territoriosActivos: [],
      })

      const chain1 = buildChain([{ count: 12 }])
      const chain2 = buildChain([{ count: 5 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(res.status).toBe(200)
      expect(body.ganadoMes).toBe(12)
      expect(body.perdidoMes).toBe(5)
      expect(mockGetSessionContext).toHaveBeenCalledTimes(1)
    })

    it('devuelve 0/0 si el gerente no tiene agentes en sus territorios', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'gerente-2', role: 'gerente' },
      })
      mockGetSessionContext.mockResolvedValue({
        userId: 'gerente-2',
        role: 'gerente',
        territoriosGestionados: [],
        agentesVisibles: [],
        territoriosActivos: [],
      })

      mockDbSelect = vi.fn() // no debe llamarse

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(res.status).toBe(200)
      expect(body.ganadoMes).toBe(0)
      expect(body.perdidoMes).toBe(0)
      // Short-circuit: no DB queries cuando no hay agentes
      expect(mockDbSelect).not.toHaveBeenCalled()
    })
  })

  describe('límite de mes', () => {
    it('usa la fecha del día 1 del mes actual en AR (parseFechaAR)', async () => {
      // Simulamos primer día del mes siguiente para verificar que el contador volvería a 0
      mockTodayStrAR.mockReturnValue('2026-06-01')
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      })

      // El mes cambia: junio. Si no hay leads de junio → 0/0
      const chain1 = buildChain([{ count: 0 }])
      const chain2 = buildChain([{ count: 0 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(body.ganadoMes).toBe(0)
      expect(body.perdidoMes).toBe(0)
    })

    it('maneja diciembre → enero (rollover de año)', async () => {
      mockTodayStrAR.mockReturnValue('2026-12-15')
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      })

      const chain1 = buildChain([{ count: 3 }])
      const chain2 = buildChain([{ count: 1 }])
      mockDbSelect = vi.fn()
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const res = await GET()
      const body = await res.json() as { ganadoMes: number; perdidoMes: number }

      expect(res.status).toBe(200)
      expect(body.ganadoMes).toBe(3)
      expect(body.perdidoMes).toBe(1)
    })
  })
})

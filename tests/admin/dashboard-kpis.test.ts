/**
 * Tests para la ruta GET /api/admin/dashboard-kpis: validación de UUID de los
 * filtros territorioId / gerenteId. La lógica del servicio se cubre con tests
 * puros en dashboard.service.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSelect, mockAuth, mockRequireAdmin } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('@/db', () => ({ db: { select: mockSelect } }))

vi.mock('@/db/schema', () => ({
  pedidos: { $inferSelect: {} },
  pedidoItems: { $inferSelect: {} },
  territorioGerente: { $inferSelect: {} },
  clientes: { $inferSelect: {} },
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))

import { GET as getDashboardKpis } from '@/app/api/admin/dashboard-kpis/route'

const ADMIN_SESSION = {
  user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

describe('GET /api/admin/dashboard-kpis — validación', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('responde 400 con territorioId inválido (no es UUID)', async () => {
    const req = new NextRequest('http://localhost/api/admin/dashboard-kpis?territorioId=no-es-uuid')
    const res = await getDashboardKpis(req)
    expect(res.status).toBe(400)
  })

  it('responde 400 con gerenteId inválido (no es UUID)', async () => {
    const req = new NextRequest('http://localhost/api/admin/dashboard-kpis?gerenteId=not-a-uuid')
    const res = await getDashboardKpis(req)
    expect(res.status).toBe(400)
  })

  it('responde 400 con granularidad inválida', async () => {
    const req = new NextRequest('http://localhost/api/admin/dashboard-kpis?granularidad=trimestre')
    const res = await getDashboardKpis(req)
    expect(res.status).toBe(400)
  })
})

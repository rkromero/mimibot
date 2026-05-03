import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de la DB antes de importar el módulo
vi.mock('@/db', () => ({
  db: {
    query: {
      leads: {
        findFirst: vi.fn(),
      },
    },
  },
}))

import { canAccessLead, requireAdmin } from '@/lib/authz'
import { AuthzError } from '@/lib/errors'
import { db } from '@/db'

const mockFindFirst = db.query.leads.findFirst as ReturnType<typeof vi.fn>

describe('canAccessLead', () => {
  const adminUser = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' }
  const agentUser = { id: 'agent-1', email: 'agent@test.com', name: 'Agent', role: 'agent' as const, avatarColor: '#000' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('permite el acceso de admin sin consultar la DB', async () => {
    await expect(canAccessLead(adminUser, 'lead-1')).resolves.toBeUndefined()
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('permite acceso de agente a su propio lead', async () => {
    mockFindFirst.mockResolvedValue({ id: 'lead-1' })
    await expect(canAccessLead(agentUser, 'lead-1')).resolves.toBeUndefined()
  })

  it('lanza AuthzError cuando el agente no tiene acceso', async () => {
    mockFindFirst.mockResolvedValue(null)
    await expect(canAccessLead(agentUser, 'lead-other')).rejects.toThrow(AuthzError)
  })
})

describe('requireAdmin', () => {
  it('no lanza para admin', () => {
    const admin = { id: '1', email: 'a@b.com', name: 'A', role: 'admin' as const, avatarColor: '#000' }
    expect(() => requireAdmin(admin)).not.toThrow()
  })

  it('lanza AuthzError para agente', () => {
    const agent = { id: '2', email: 'b@c.com', name: 'B', role: 'agent' as const, avatarColor: '#000' }
    expect(() => requireAdmin(agent)).toThrow(AuthzError)
  })
})

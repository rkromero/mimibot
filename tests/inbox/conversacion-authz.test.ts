/**
 * canAccessConversacion — las conversaciones del inbox pueden ser de lead o
 * de cliente. Antes, las rutas de mensajes / marcar leído exigían leadId y
 * las de cliente daban 404. Ahora la autorización sigue al dueño:
 * cliente → reglas de cliente, lead → reglas de lead, huérfana → admin/gerente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindConv, mockCanAccessLead, mockCanAccessCliente } = vi.hoisted(() => ({
  mockFindConv: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockCanAccessCliente: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { query: { conversations: { findFirst: mockFindConv } } },
}))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead }))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: mockCanAccessCliente }))

import { canAccessConversacion } from '@/lib/authz/conversaciones'
import { AuthzError, NotFoundError } from '@/lib/errors'

function user(role: string) {
  return { id: 'u1', role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanAccessLead.mockResolvedValue(undefined)
  mockCanAccessCliente.mockResolvedValue(undefined)
})

describe('canAccessConversacion', () => {
  it('conversación inexistente → NotFoundError', async () => {
    mockFindConv.mockResolvedValue(undefined)
    await expect(canAccessConversacion(user('admin'), 'conv-x')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('conversación de cliente: usa las reglas del cliente y no las del lead', async () => {
    mockFindConv.mockResolvedValue({ id: 'c1', leadId: null, clienteId: 'cli-1' })
    const r = await canAccessConversacion(user('vendedor'), 'c1')
    expect(r).toEqual({ id: 'c1', leadId: null, clienteId: 'cli-1' })
    expect(mockCanAccessCliente).toHaveBeenCalledWith(user('vendedor'), 'cli-1')
    expect(mockCanAccessLead).not.toHaveBeenCalled()
  })

  it('conversación de cliente ajeno: propaga el AuthzError del cliente', async () => {
    mockFindConv.mockResolvedValue({ id: 'c1', leadId: null, clienteId: 'cli-1' })
    mockCanAccessCliente.mockRejectedValue(new AuthzError('No tenés acceso a este cliente'))
    await expect(canAccessConversacion(user('vendedor'), 'c1')).rejects.toBeInstanceOf(AuthzError)
  })

  it('lead convertido en cliente (ambos ids): manda el cliente, como en el listado del inbox', async () => {
    mockFindConv.mockResolvedValue({ id: 'c2', leadId: 'lead-1', clienteId: 'cli-1' })
    await canAccessConversacion(user('agent'), 'c2')
    expect(mockCanAccessCliente).toHaveBeenCalledWith(user('agent'), 'cli-1')
    expect(mockCanAccessLead).not.toHaveBeenCalled()
  })

  it('conversación de lead: usa las reglas del lead', async () => {
    mockFindConv.mockResolvedValue({ id: 'c3', leadId: 'lead-1', clienteId: null })
    await canAccessConversacion(user('agent'), 'c3')
    expect(mockCanAccessLead).toHaveBeenCalledWith(user('agent'), 'lead-1')
    expect(mockCanAccessCliente).not.toHaveBeenCalled()
  })

  it('conversación huérfana (sin lead ni cliente): admin y gerente sí, ventas no', async () => {
    mockFindConv.mockResolvedValue({ id: 'c4', leadId: null, clienteId: null })
    await expect(canAccessConversacion(user('admin'), 'c4')).resolves.toBeDefined()
    await expect(canAccessConversacion(user('gerente'), 'c4')).resolves.toBeDefined()
    await expect(canAccessConversacion(user('vendedor'), 'c4')).rejects.toBeInstanceOf(AuthzError)
    expect(mockCanAccessLead).not.toHaveBeenCalled()
    expect(mockCanAccessCliente).not.toHaveBeenCalled()
  })
})

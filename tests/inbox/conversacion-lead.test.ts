/**
 * asegurarConversacionLead — la conversación del lead se crea vacía: sin
 * mensajes ni lastMessageAt, así no aparece en el inbox hasta que alguien
 * escriba (vendedor o la persona por WhatsApp).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindConv, mockInsertValues, mockInsertTable, mockUpdateSet } = vi.hoisted(() => ({
  mockFindConv: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertTable: vi.fn(),
  mockUpdateSet: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: { conversations: { findFirst: mockFindConv } },
    insert: (table: unknown) => {
      mockInsertTable(table)
      return {
        values: (v: unknown) => {
          mockInsertValues(v)
          return { returning: () => Promise.resolve([{ id: 'conv-nueva' }]) }
        },
      }
    },
    update: () => ({
      set: (v: unknown) => {
        mockUpdateSet(v)
        return { where: () => Promise.resolve() }
      },
    }),
  },
}))

import { asegurarConversacionLead } from '@/lib/inbox/conversacion-lead'
import { conversations } from '@/db/schema'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('asegurarConversacionLead', () => {
  it('reutiliza la conversación existente sin insertar nada', async () => {
    mockFindConv.mockResolvedValue({ id: 'conv-1' })
    const r = await asegurarConversacionLead('lead-1', '+5491100000000')
    expect(r).toEqual({ conversationId: 'conv-1', creada: false })
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('adopta la conversación del mismo teléfono sin lead (unificación con la del cliente)', async () => {
    // 1ra búsqueda (por leadId): nada; 2da (por teléfono sin lead): la del cliente
    mockFindConv.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 'conv-cliente' })
    const r = await asegurarConversacionLead('lead-1', '+5491100000000')
    expect(r).toEqual({ conversationId: 'conv-cliente', creada: false })
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1' }))
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('crea la conversación vacía (solo la fila, sin mensajes ni lastMessageAt)', async () => {
    mockFindConv.mockResolvedValue(undefined)
    const r = await asegurarConversacionLead('lead-1', '+5491100000000')
    expect(r).toEqual({ conversationId: 'conv-nueva', creada: true })

    // Un único insert, y es en conversations (nunca en messages)
    expect(mockInsertTable).toHaveBeenCalledTimes(1)
    expect(mockInsertTable.mock.calls[0]![0]).toBe(conversations)

    const values = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>
    expect(values).toMatchObject({ leadId: 'lead-1', waContactPhone: '+5491100000000' })
    expect(values).not.toHaveProperty('lastMessageAt')
    expect(values).not.toHaveProperty('unreadCount')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de todas las dependencias externas antes de importar el módulo
vi.mock('@/db', () => ({
  db: {
    query: {
      leads: { findFirst: vi.fn() },
      botConfig: { findFirst: vi.fn() },
      messages: { findMany: vi.fn() },
      pipelineStages: { findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'msg-1' }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    execute: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: { create: vi.fn() },
  },
  BOT_MODEL: 'claude-sonnet-4-5',
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendTextMessage: vi.fn(),
}))

import { db } from '@/db'
import { anthropic } from '@/lib/claude/client'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { processBotTurn } from '@/lib/claude/bot'

const mockFindLead = db.query.leads.findFirst as ReturnType<typeof vi.fn>
const mockFindConfig = db.query.botConfig.findFirst as ReturnType<typeof vi.fn>
const mockFindMessages = db.query.messages.findMany as ReturnType<typeof vi.fn>
const mockFindStages = db.query.pipelineStages.findMany as ReturnType<typeof vi.fn>
const mockInsert = db.insert as ReturnType<typeof vi.fn>
const mockUpdate = db.update as ReturnType<typeof vi.fn>
const mockClaudeCreate = anthropic.messages.create as ReturnType<typeof vi.fn>
const mockSendText = sendTextMessage as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processBotTurn', () => {
  const baseParams = {
    leadId: 'lead-1',
    conversationId: 'conv-1',
    inboundMessageId: 'msg-in-1',
    contactPhone: '+5491123456789',
  }

  it('no procesa si el bot está desactivado', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: false, botQualified: false, botTurnCount: 0 })
    mockFindConfig.mockResolvedValue(null)

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  it('no procesa si el lead ya fue calificado', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: true, botTurnCount: 3 })
    mockFindConfig.mockResolvedValue(null)

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  it('responde con Claude y guarda el mensaje', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: false, botTurnCount: 1 })
    mockFindConfig.mockResolvedValue({
      systemPrompt: 'Sos un bot de ventas.',
      maxTurns: 6,
      handoffPhrases: [],
    })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', body: 'Hola', sentAt: new Date() },
    ])
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hola! ¿En qué te puedo ayudar?' }],
    })

    // Configurar cadena de mocks para insert
    const returningMock = vi.fn().mockResolvedValue([{ id: 'msg-bot-1' }])
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
    mockInsert.mockReturnValue({ values: valuesMock })

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    mockUpdate.mockReturnValue({ set: setMock })

    mockSendText.mockResolvedValue('wamid.xxx')

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalled()
    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', 'Hola! ¿En qué te puedo ayudar?')
  })

  it('detecta el marcador [HANDOFF] y activa el handoff', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: false, botTurnCount: 4 })
    mockFindConfig.mockResolvedValue({ systemPrompt: 'test', maxTurns: 6, handoffPhrases: [] })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', body: 'quiero comprar', sentAt: new Date() },
    ])
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Perfecto, te paso con un asesor. [HANDOFF]' }],
    })
    mockFindStages.mockResolvedValue([
      { id: 's1', slug: 'nuevo', position: 0, isTerminal: false },
      { id: 's2', slug: 'contactado', position: 1, isTerminal: false },
    ])

    const returningMock = vi.fn().mockResolvedValue([{ id: 'msg-bot-2' }])
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
    mockInsert.mockReturnValue({ values: valuesMock })

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    mockUpdate.mockReturnValue({ set: setMock })
    mockSendText.mockResolvedValue('wamid.yyy')

    await processBotTurn(baseParams)

    // Verificar que se hizo handoff: update de lead con botEnabled: false
    expect(mockUpdate).toHaveBeenCalled()
    const setCall = setMock.mock.calls.find((c) => c[0]?.botEnabled === false)
    expect(setCall).toBeDefined()
  })
})

/**
 * Espera del bot antes de responder (lib/claude/bot-debounce).
 *
 *  1. Varios mensajes seguidos → un solo turno del bot, cuando pasa la espera
 *     desde el ÚLTIMO mensaje.
 *  2. La marca bot_responder_desde se guarda al programar y se limpia al terminar.
 *  3. Si llega un mensaje mientras el bot está generando, al terminar vuelve a
 *     programar y responde también a eso (una sola vez más).
 *  4. Leads distintos no se pisan.
 *  5. El scheduler retoma las esperas vencidas sin timer en memoria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockFindConfig, mockUpdateSet, mockSelectWhere, mockProcess } = vi.hoisted(() => ({
  mockFindConfig: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockProcess: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: { botConfig: { findFirst: mockFindConfig } },
    update: () => ({
      set: (v: unknown) => {
        mockUpdateSet(v)
        return { where: () => Promise.resolve() }
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({ where: mockSelectWhere }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/claude/bot', () => ({ processBotTurn: mockProcess }))

import {
  calcularEsperaSegundos,
  programarTurnoBot,
  retomarTurnosBotPendientes,
  resetEstadoBotDebounce,
} from '@/lib/claude/bot-debounce'

const msg = (leadId: string, n: number) => ({
  leadId,
  conversationId: `conv-${leadId}`,
  inboundMessageId: `msg-${leadId}-${n}`,
  contactPhone: '+5491100000000',
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetEstadoBotDebounce()
  mockFindConfig.mockResolvedValue({ esperaRespuestaSegundos: 15 })
  mockProcess.mockResolvedValue(undefined)
  mockSelectWhere.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('calcularEsperaSegundos', () => {
  it('usa 15 s por defecto y acota al rango 0–120', () => {
    expect(calcularEsperaSegundos(null)).toBe(15)
    expect(calcularEsperaSegundos({ esperaRespuestaSegundos: null })).toBe(15)
    expect(calcularEsperaSegundos({ esperaRespuestaSegundos: 200 })).toBe(120)
    expect(calcularEsperaSegundos({ esperaRespuestaSegundos: -3 })).toBe(0)
    expect(calcularEsperaSegundos({ esperaRespuestaSegundos: 7.6 })).toBe(8)
  })
})

describe('programarTurnoBot', () => {
  it('dos mensajes seguidos → una sola respuesta, 15 s después del último', async () => {
    await programarTurnoBot(msg('A', 1))
    await vi.advanceTimersByTimeAsync(5_000)
    await programarTurnoBot(msg('A', 2))

    // 14 s después del segundo mensaje todavía no respondió (la espera se reinició)
    await vi.advanceTimersByTimeAsync(14_000)
    expect(mockProcess).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(mockProcess).toHaveBeenCalledTimes(1)
    expect(mockProcess).toHaveBeenCalledWith(msg('A', 2))

    // Y no vuelve a responder solo
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockProcess).toHaveBeenCalledTimes(1)
  })

  it('respeta la espera configurada (0 = responde enseguida)', async () => {
    mockFindConfig.mockResolvedValue({ esperaRespuestaSegundos: 0 })
    await programarTurnoBot(msg('A', 1))
    await vi.advanceTimersByTimeAsync(0)
    expect(mockProcess).toHaveBeenCalledTimes(1)
  })

  it('guarda bot_responder_desde al programar y lo limpia al terminar', async () => {
    const inicio = Date.now()
    await programarTurnoBot(msg('A', 1))

    const marca = mockUpdateSet.mock.calls[0]![0] as { botResponderDesde: Date }
    expect(marca.botResponderDesde.getTime()).toBe(inicio + 15_000)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockProcess).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet).toHaveBeenLastCalledWith({ botResponderDesde: null })
  })

  it('mensaje que llega mientras el bot genera → responde una vez más al terminar', async () => {
    let terminarTurno: () => void = () => {}
    mockProcess.mockImplementationOnce(
      () => new Promise<void>((resolve) => { terminarTurno = resolve }),
    )

    await programarTurnoBot(msg('A', 1))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockProcess).toHaveBeenCalledTimes(1) // generando…

    // Llega otro mensaje en el medio: no arranca una segunda corrida en paralelo
    await programarTurnoBot(msg('A', 2))
    expect(mockProcess).toHaveBeenCalledTimes(1)

    terminarTurno()
    await vi.advanceTimersByTimeAsync(0)
    // Se reprogramó con la espera completa, no responde en el acto
    expect(mockProcess).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockProcess).toHaveBeenCalledTimes(2)
    expect(mockProcess).toHaveBeenLastCalledWith(msg('A', 2))
  })

  it('leads distintos se responden por separado', async () => {
    await programarTurnoBot(msg('A', 1))
    await programarTurnoBot(msg('B', 1))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockProcess).toHaveBeenCalledTimes(2)
    expect(mockProcess.mock.calls.map((c) => (c[0] as { leadId: string }).leadId).sort()).toEqual(['A', 'B'])
  })

  it('si processBotTurn falla, no explota y limpia la marca', async () => {
    mockProcess.mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await programarTurnoBot(msg('A', 1))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mockUpdateSet).toHaveBeenLastCalledWith({ botResponderDesde: null })
    spy.mockRestore()
  })
})

describe('retomarTurnosBotPendientes', () => {
  it('dispara los vencidos sin timer en memoria y salta los que ya tienen espera en curso', async () => {
    mockSelectWhere.mockResolvedValue([
      { leadId: 'A', conversationId: 'conv-A', waContactPhone: '+5491100000001', contactPhone: null },
      { leadId: 'B', conversationId: 'conv-B', waContactPhone: null, contactPhone: '+5491100000002' },
    ])
    // B tiene un timer en memoria: lo va a responder ese timer, no el scheduler
    await programarTurnoBot(msg('B', 1))

    const n = await retomarTurnosBotPendientes()
    await vi.advanceTimersByTimeAsync(0)

    expect(n).toBe(1)
    expect(mockProcess).toHaveBeenCalledTimes(1)
    expect(mockProcess).toHaveBeenCalledWith({
      leadId: 'A',
      conversationId: 'conv-A',
      inboundMessageId: '',
      contactPhone: '+5491100000001',
    })
  })

  it('vencido sin conversación o teléfono → limpia la marca sin disparar', async () => {
    mockSelectWhere.mockResolvedValue([
      { leadId: 'A', conversationId: null, waContactPhone: null, contactPhone: '+549' },
    ])
    const n = await retomarTurnosBotPendientes()
    expect(n).toBe(0)
    expect(mockProcess).not.toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith({ botResponderDesde: null })
  })
})

/**
 * Envíos masivos con la plantilla de último seguimiento (lib/envios-masivos/procesar.ts).
 *
 * Cuando la plantilla del envío es la configurada como último seguimiento,
 * cada destinatario tiene que pasar por el motor de seguimiento (manda + nota
 * + cierre a Perdido programado), no por el envío suelto.
 *
 *  1. Plantilla de último seguimiento → motor por cada lead, marcado con el envío; no se manda suelto.
 *  2. El motor dice que no se puede (ValidationError) → omitido con ese motivo, no fallido.
 *  3. Error de Meta en el motor → fallido.
 *  4. Otra plantilla → envío suelto de siempre, el motor no se toca.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from '@/lib/errors'

const m = vi.hoisted(() => ({
  findEnvio: vi.fn(),
  findUser: vi.fn(),
  findTemplate: vi.fn(),
  findDestinatarios: vi.fn(),
  findConversation: vi.fn(),
  selectRows: vi.fn(),
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  inserts: [] as Array<Record<string, unknown>>,
  esUltimo: vi.fn(),
  enviarUltimo: vi.fn(),
  sendTemplate: vi.fn(),
}))

vi.mock('@/lib/envios-masivos/reglas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/envios-masivos/reglas')>()
  return { ...real, PAUSA_ENTRE_MENSAJES_MS: 0 }
})
vi.mock('@/lib/followup/engine', () => ({
  esPlantillaUltimoSeguimiento: m.esUltimo,
  enviarUltimoSeguimiento: m.enviarUltimo,
}))
vi.mock('@/lib/whatsapp/client', () => ({
  sendTemplateMessage: m.sendTemplate,
  buildBodyComponents: (values: string[]) => (values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : undefined),
}))
vi.mock('@/lib/realtime/broker', () => ({ publishCrmEvent: vi.fn() }))
vi.mock('@/db', () => {
  const selectChain = () => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      then: (res: (v: unknown) => unknown) => Promise.resolve(m.selectRows()).then(res),
    }
    return chain
  }
  return {
    db: {
      query: {
        enviosMasivos: { findFirst: m.findEnvio },
        users: { findFirst: m.findUser },
        whatsappTemplates: { findFirst: m.findTemplate },
        enviosMasivosDestinatarios: { findMany: m.findDestinatarios },
        conversations: { findFirst: m.findConversation },
      },
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            m.updates.push({ table, values })
          },
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          m.inserts.push(v)
          return { returning: async () => [{ id: 'msg-suelto' }] }
        },
      }),
      execute: vi.fn().mockResolvedValue(undefined),
    },
  }
})

import { enviosMasivosDestinatarios } from '@/db/schema'
import { procesarEnvio } from '@/lib/envios-masivos/procesar'

const envio = {
  id: 'envio-1',
  nombre: 'Último seguimiento propuestas',
  templateName: 'ultimo_seguimiento',
  templateLang: 'es',
  templateBody: 'Hola {{1}}, ¿pudiste ver la propuesta?',
  estado: 'programado',
  programadoAt: new Date('2026-10-19T15:00:00Z'), // 12:00 AR
  iniciadoAt: null,
  creadoPor: 'admin-1',
}

const destinatario = (leadId: string) => ({
  id: `dest-${leadId}`,
  envioId: envio.id,
  leadId,
  conversationId: `conv-${leadId}`,
  estado: 'pendiente',
  motivo: null,
  messageId: null,
  enviadoAt: null,
  createdAt: new Date(),
})

/** Cambios aplicados a la fila de un destinatario (los updates sobre la tabla de destinatarios, en orden). */
const cambiosDestinatarios = () => m.updates.filter((u) => u.table === enviosMasivosDestinatarios).map((u) => u.values)

beforeEach(() => {
  vi.clearAllMocks()
  m.updates.length = 0
  m.inserts.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T15:00:00Z')) // 12:00 AR, dentro del horario
  m.findEnvio.mockResolvedValue(envio)
  m.findUser.mockResolvedValue({ name: 'Admin' })
  m.findTemplate.mockResolvedValue({ variables: null })
  m.selectRows.mockReturnValue([{ isOpen: true, assignedTo: 'vend-1', productInterest: null, contactName: 'Ana', vendedorNombre: 'Carla' }])
  m.findConversation.mockResolvedValue({ id: 'conv-x', waContactPhone: '+5491100000000', leadId: 'lead-x' })
})

describe('procesarEnvio con la plantilla de último seguimiento', () => {
  it('manda por el motor a cada lead, marcado con el envío, y no manda suelto', async () => {
    m.esUltimo.mockResolvedValue(true)
    m.findDestinatarios.mockResolvedValue([destinatario('lead-1'), destinatario('lead-2')])
    m.enviarUltimo.mockImplementation(async (leadId: string) => ({
      body: 'Hola', cierraEl: new Date('2026-10-19T23:00:00Z'), messageId: `msg-${leadId}`, conversationId: `conv-${leadId}`,
    }))

    await procesarEnvio(envio.id)

    expect(m.esUltimo).toHaveBeenCalledWith('ultimo_seguimiento', 'es')
    expect(m.enviarUltimo).toHaveBeenCalledTimes(2)
    expect(m.enviarUltimo).toHaveBeenCalledWith('lead-1', { id: 'vend-1', name: 'Carla' }, { envioMasivoId: 'envio-1' })
    expect(m.sendTemplate).not.toHaveBeenCalled()
    expect(m.inserts).toHaveLength(0)

    const cambios = cambiosDestinatarios()
    expect(cambios).toHaveLength(2)
    expect(cambios[0]).toMatchObject({ estado: 'enviado', messageId: 'msg-lead-1', conversationId: 'conv-lead-1', motivo: null })
    expect(cambios[1]).toMatchObject({ estado: 'enviado', messageId: 'msg-lead-2' })
  })

  it('si el lead no tiene vendedor asignado, el remitente es quien creó el envío', async () => {
    m.esUltimo.mockResolvedValue(true)
    m.selectRows.mockReturnValue([{ isOpen: true, assignedTo: null, productInterest: null, contactName: 'Ana', vendedorNombre: null }])
    m.findDestinatarios.mockResolvedValue([destinatario('lead-1')])
    m.enviarUltimo.mockResolvedValue({ body: 'Hola', cierraEl: new Date(), messageId: 'msg-1', conversationId: 'conv-1' })

    await procesarEnvio(envio.id)

    expect(m.enviarUltimo).toHaveBeenCalledWith('lead-1', { id: 'admin-1', name: 'Admin' }, { envioMasivoId: 'envio-1' })
  })

  it('cuando el motor dice que no se puede, queda omitido con ese motivo (no fallido)', async () => {
    m.esUltimo.mockResolvedValue(true)
    m.findDestinatarios.mockResolvedValue([destinatario('lead-1')])
    m.enviarUltimo.mockRejectedValue(new ValidationError('Ya se mandó el último seguimiento y está esperando respuesta'))

    await procesarEnvio(envio.id)

    const [cambio] = cambiosDestinatarios()
    expect(cambio).toMatchObject({ estado: 'omitido', motivo: 'Ya se mandó el último seguimiento y está esperando respuesta' })
    expect(m.sendTemplate).not.toHaveBeenCalled()
  })

  it('un error de Meta dentro del motor deja al destinatario fallido', async () => {
    m.esUltimo.mockResolvedValue(true)
    m.findDestinatarios.mockResolvedValue([destinatario('lead-1')])
    m.enviarUltimo.mockRejectedValue(new Error('Meta 131047: re-engagement'))

    await procesarEnvio(envio.id)

    const [cambio] = cambiosDestinatarios()
    expect(cambio).toMatchObject({ estado: 'fallido', motivo: 'Meta 131047: re-engagement' })
  })

  it('con otra plantilla manda suelto y no toca el motor', async () => {
    m.esUltimo.mockResolvedValue(false)
    m.findDestinatarios.mockResolvedValue([destinatario('lead-1')])
    m.sendTemplate.mockResolvedValue('wamid.1')

    await procesarEnvio(envio.id)

    expect(m.enviarUltimo).not.toHaveBeenCalled()
    expect(m.sendTemplate).toHaveBeenCalledTimes(1)
    expect(m.inserts[0]).toMatchObject({ contentType: 'template', envioMasivoId: 'envio-1' })
    expect(cambiosDestinatarios()[0]).toMatchObject({ estado: 'enviado', messageId: 'msg-suelto' })
  })
})

/**
 * registrarMuestraEntregada / onPedidoEntregado — cuando un pedido de muestra
 * CDA (tipo = 'muestra' + leadId) pasa a `entregado`, el lead pasa a la etapa
 * "Muestra enviada", guarda la fecha y agrega una nota de sistema.
 *
 *  1. Pedido de venta (o sin leadId) → no hace nada.
 *  2. Lead ya procesado (muestraEntregadaAt) → idempotente, no duplica nota.
 *  3. Caso feliz → guarda fecha + stageId, nota de sistema, stage_changed, evento realtime
 *     y aviso interno `muestra_despachada` (con o sin foto de la guía).
 *  4. Lead cerrado → guarda fecha y nota, pero no lo mueve de etapa.
 *  5. Etapa inexistente → guarda fecha y nota, no mueve.
 *  6. Lead ya en "Muestra enviada" → guarda fecha y nota, no duplica stage_changed.
 *  7. onPedidoEntregado busca el pedido y delega; si falla, no lanza.
 *  8. Aviso automático al cliente solo si está activado en Ajustes y hay foto de la guía.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockFindLead,
  mockFindStage,
  mockFindPedido,
  mockFindConfig,
  mockUpdateSet,
  mockUpdateWhere,
  mockInsertValues,
  mockPublish,
  mockEnviarAviso,
} = vi.hoisted(() => ({
  mockFindLead: vi.fn(),
  mockFindStage: vi.fn(),
  mockFindPedido: vi.fn(),
  mockFindConfig: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue(undefined),
  mockInsertValues: vi.fn().mockResolvedValue(undefined),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockEnviarAviso: vi.fn().mockResolvedValue({ body: '', avisadaAt: new Date(), pedidoId: 'p' }),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      leads: { findFirst: mockFindLead },
      pipelineStages: { findFirst: mockFindStage },
      pedidos: { findFirst: mockFindPedido },
      whatsappConfig: { findFirst: mockFindConfig },
    },
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values)
        return { where: mockUpdateWhere }
      },
    }),
    insert: () => ({ values: mockInsertValues }),
  },
}))

vi.mock('@/lib/realtime/broker', () => ({ publishCrmEvent: mockPublish }))
vi.mock('@/lib/leads/muestra-despachada', () => ({ enviarAvisoMuestra: mockEnviarAviso }))

import {
  registrarMuestraEntregada,
  onPedidoEntregado,
  SLUG_ETAPA_MUESTRA_ENVIADA,
} from '@/lib/leads/muestra-enviada'

const STAGE_ID = 'stage-muestra'
const LEAD = { id: 'lead-1', stageId: 'stage-nuevo', isOpen: true, assignedTo: 'agente-1', muestraEntregadaAt: null }
const ENTREGADO_AT = new Date('2026-08-24T15:00:00.000Z')
const PEDIDO = { id: 'aaaaaaaa-0000-0000-0000-0000abcd1234', tipo: 'muestra' as const, leadId: 'lead-1', entregadoAt: ENTREGADO_AT }

function acciones() {
  return mockInsertValues.mock.calls.map((c) => (c[0] as { action: string }).action)
}

function eventos() {
  return mockPublish.mock.calls.map((c) => (c[0] as { type: string }).type)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindLead.mockResolvedValue({ ...LEAD, contact: { name: 'Juan Pérez' } })
  mockFindStage.mockResolvedValue({ id: STAGE_ID })
  mockFindConfig.mockResolvedValue({ muestraAuto: false })
})

describe('registrarMuestraEntregada', () => {
  it('usa el slug fijo muestra-enviada', () => {
    expect(SLUG_ETAPA_MUESTRA_ENVIADA).toBe('muestra-enviada')
  })

  it('pedido de venta o sin lead → no hace nada', async () => {
    expect(await registrarMuestraEntregada({ ...PEDIDO, tipo: 'venta' }, 'u')).toEqual({ procesado: false, etapaMovida: false, stageId: null })
    expect(await registrarMuestraEntregada({ ...PEDIDO, leadId: null }, 'u')).toEqual({ procesado: false, etapaMovida: false, stageId: null })
    expect(mockFindLead).not.toHaveBeenCalled()
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('lead ya procesado → idempotente', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, muestraEntregadaAt: new Date() })
    const r = await registrarMuestraEntregada(PEDIDO, 'u')
    expect(r.procesado).toBe(false)
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('caso feliz: fecha + etapa, nota de sistema, stage_changed y evento', async () => {
    const r = await registrarMuestraEntregada(PEDIDO, 'admin')
    expect(r).toEqual({ procesado: true, etapaMovida: true, stageId: STAGE_ID })

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({ muestraEntregadaAt: ENTREGADO_AT, stageId: STAGE_ID })

    expect(acciones()).toEqual(['note_added', 'stage_changed'])
    const nota = mockInsertValues.mock.calls[0]![0] as { leadId: string; userId: string; metadata: Record<string, unknown> }
    expect(nota).toMatchObject({ leadId: 'lead-1', userId: 'admin' })
    expect(nota.metadata).toMatchObject({ sistema: true, motivo: 'muestra_entregada', pedidoId: PEDIDO.id })
    expect(nota.metadata['texto']).toBe('Muestra entregada el 24/08/2026 — pedido #ABCD1234')

    expect(mockInsertValues.mock.calls[1]![0]).toMatchObject({
      action: 'stage_changed',
      metadata: { fromStageId: 'stage-nuevo', toStageId: STAGE_ID, motivo: 'muestra_entregada' },
    })

    expect(mockPublish).toHaveBeenCalledWith({
      type: 'lead_updated',
      leadId: 'lead-1',
      assignedTo: 'agente-1',
      oldAssigned: 'agente-1',
      stageId: STAGE_ID,
      oldStageId: 'stage-nuevo',
    })
    // Aviso interno para que el vendedor / admin le mande la guía al cliente
    expect(mockPublish).toHaveBeenCalledWith({
      type: 'muestra_despachada',
      leadId: 'lead-1',
      assignedTo: 'agente-1',
      pedidoId: PEDIDO.id,
      contactName: 'Juan Pérez',
      conFoto: false,
    })
    expect(eventos()).toEqual(['lead_updated', 'muestra_despachada'])
  })

  it('retiro en fábrica → queda avisada en el acto (no hay guía) y la nota lo dice', async () => {
    const r = await registrarMuestraEntregada({ ...PEDIDO, metodoEntrega: 'retiro_fabrica' }, 'fabrica-1')
    expect(r).toEqual({ procesado: true, etapaMovida: true, stageId: STAGE_ID })
    // Entregada y avisada con la misma fecha: no entra en "muestras por avisar"
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({ muestraEntregadaAt: ENTREGADO_AT, muestraAvisadaAt: ENTREGADO_AT, stageId: STAGE_ID })
    const nota = mockInsertValues.mock.calls[0]![0] as { metadata: Record<string, unknown> }
    expect(nota.metadata['texto']).toBe('Muestra retirada en fábrica el 24/08/2026 — pedido #ABCD1234. No requiere aviso al cliente.')
    expect(acciones()).toEqual(['note_added', 'stage_changed'])
  })

  it('expreso → no queda avisada: el vendedor tiene que mandar la guía', async () => {
    await registrarMuestraEntregada({ ...PEDIDO, metodoEntrega: 'expreso' }, 'admin')
    expect(mockUpdateSet.mock.calls[0]![0]).not.toHaveProperty('muestraAvisadaAt')
  })

  it('con foto de la guía el aviso interno lo dice (conFoto)', async () => {
    await registrarMuestraEntregada({ ...PEDIDO, remitoFotoUrl: 'firmas/guia.png' }, 'admin')
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'muestra_despachada', conFoto: true }))
  })

  it('sin entregadoAt usa la fecha actual', async () => {
    const r = await registrarMuestraEntregada({ ...PEDIDO, entregadoAt: null }, 'admin')
    expect(r.procesado).toBe(true)
    const set = mockUpdateSet.mock.calls[0]![0] as { muestraEntregadaAt: Date }
    expect(set.muestraEntregadaAt).toBeInstanceOf(Date)
  })

  it('lead cerrado → registra fecha y nota pero no lo mueve', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, isOpen: false })
    const r = await registrarMuestraEntregada(PEDIDO, 'admin')
    expect(r).toEqual({ procesado: true, etapaMovida: false, stageId: STAGE_ID })
    expect(mockUpdateSet.mock.calls[0]![0]).not.toHaveProperty('stageId')
    expect(acciones()).toEqual(['note_added'])
    // Sin cambio de etapa no hay lead_updated, pero el aviso interno sale igual
    expect(eventos()).toEqual(['muestra_despachada'])
  })

  it('etapa inexistente → registra fecha y nota, no mueve', async () => {
    mockFindStage.mockResolvedValue(undefined)
    const r = await registrarMuestraEntregada(PEDIDO, 'admin')
    expect(r).toEqual({ procesado: true, etapaMovida: false, stageId: null })
    expect(mockUpdateSet.mock.calls[0]![0]).not.toHaveProperty('stageId')
    expect(acciones()).toEqual(['note_added'])
  })

  it('lead ya en "Muestra enviada" → nota sí, stage_changed no', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, stageId: STAGE_ID })
    const r = await registrarMuestraEntregada(PEDIDO, 'admin')
    expect(r).toEqual({ procesado: true, etapaMovida: false, stageId: STAGE_ID })
    expect(acciones()).toEqual(['note_added'])
    expect(eventos()).toEqual(['muestra_despachada'])
  })
})

describe('aviso automático al cliente', () => {
  const CON_FOTO = { ...PEDIDO, remitoFotoUrl: 'firmas/guia.png' }

  it('apagado en Ajustes → no manda nada', async () => {
    await registrarMuestraEntregada(CON_FOTO, 'admin')
    expect(mockEnviarAviso).not.toHaveBeenCalled()
  })

  it('activado y con foto → manda el aviso con el usuario que entregó', async () => {
    mockFindConfig.mockResolvedValue({ muestraAuto: true })
    await registrarMuestraEntregada(CON_FOTO, 'fabrica-1')
    // El envío corre sin esperar: dejamos pasar el tick
    await new Promise((r) => setTimeout(r, 0))
    expect(mockEnviarAviso).toHaveBeenCalledWith('lead-1', { id: 'fabrica-1', name: null })
  })

  it('activado pero sin foto (retiro en fábrica / sin guía) → no manda', async () => {
    mockFindConfig.mockResolvedValue({ muestraAuto: true })
    await registrarMuestraEntregada(PEDIDO, 'admin')
    expect(mockFindConfig).not.toHaveBeenCalled()
    expect(mockEnviarAviso).not.toHaveBeenCalled()
  })

  it('si el envío falla, la entrega no se cae', async () => {
    mockFindConfig.mockResolvedValue({ muestraAuto: true })
    mockEnviarAviso.mockRejectedValueOnce(new Error('Meta caído'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await registrarMuestraEntregada(CON_FOTO, 'admin')
    await new Promise((res) => setTimeout(res, 0))
    expect(r.procesado).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('onPedidoEntregado', () => {
  it('busca el pedido (con el método de entrega) y delega', async () => {
    mockFindPedido.mockResolvedValue(PEDIDO)
    const r = await onPedidoEntregado(PEDIDO.id, 'admin')
    expect(r.procesado).toBe(true)
    expect(mockFindPedido).toHaveBeenCalledTimes(1)
    const args = mockFindPedido.mock.calls[0]![0] as { columns: Record<string, boolean> }
    expect(args.columns).toMatchObject({ metodoEntrega: true, remitoFotoUrl: true })
  })

  it('pedido inexistente → no hace nada', async () => {
    mockFindPedido.mockResolvedValue(undefined)
    const r = await onPedidoEntregado('x', 'admin')
    expect(r.procesado).toBe(false)
    expect(mockFindLead).not.toHaveBeenCalled()
  })

  it('si algo falla no lanza (best-effort)', async () => {
    mockFindPedido.mockRejectedValue(new Error('db caída'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await onPedidoEntregado(PEDIDO.id, 'admin')
    expect(r.procesado).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

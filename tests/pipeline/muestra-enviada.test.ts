/**
 * registrarMuestraEntregada / onPedidoEntregado — cuando un pedido de muestra
 * CDA (tipo = 'muestra' + leadId) pasa a `entregado`, el lead pasa a la etapa
 * "Muestra enviada", guarda la fecha y agrega una nota de sistema.
 *
 *  1. Pedido de venta (o sin leadId) → no hace nada.
 *  2. Lead ya procesado (muestraEntregadaAt) → idempotente, no duplica nota.
 *  3. Caso feliz → guarda fecha + stageId, nota de sistema, stage_changed y evento realtime.
 *  4. Lead cerrado → guarda fecha y nota, pero no lo mueve de etapa.
 *  5. Etapa inexistente → guarda fecha y nota, no mueve.
 *  6. Lead ya en "Muestra enviada" → guarda fecha y nota, no duplica stage_changed.
 *  7. onPedidoEntregado busca el pedido y delega; si falla, no lanza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockFindLead,
  mockFindStage,
  mockFindPedido,
  mockUpdateSet,
  mockUpdateWhere,
  mockInsertValues,
  mockPublish,
} = vi.hoisted(() => ({
  mockFindLead: vi.fn(),
  mockFindStage: vi.fn(),
  mockFindPedido: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue(undefined),
  mockInsertValues: vi.fn().mockResolvedValue(undefined),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      leads: { findFirst: mockFindLead },
      pipelineStages: { findFirst: mockFindStage },
      pedidos: { findFirst: mockFindPedido },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFindLead.mockResolvedValue(LEAD)
  mockFindStage.mockResolvedValue({ id: STAGE_ID })
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
    expect(mockPublish).not.toHaveBeenCalled()
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
    expect(mockPublish).not.toHaveBeenCalled()
  })
})

describe('onPedidoEntregado', () => {
  it('busca el pedido y delega', async () => {
    mockFindPedido.mockResolvedValue(PEDIDO)
    const r = await onPedidoEntregado(PEDIDO.id, 'admin')
    expect(r.procesado).toBe(true)
    expect(mockFindPedido).toHaveBeenCalledTimes(1)
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

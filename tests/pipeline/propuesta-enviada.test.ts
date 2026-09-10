/**
 * moverLeadAPropuestaEnviada / onPropuestaEnviada — al enviar una propuesta
 * (WhatsApp, email o descarga) el lead pasa a la etapa "Propuesta enviada".
 *
 *  1. Caso feliz → cambia stageId, deja stage_changed con el motivo y avisa por realtime.
 *  2. Ya está en la etapa → no hace nada.
 *  3. Lead cerrado o inexistente → no lo toca.
 *  4. Etapa inexistente (la borraron del pipeline) → no lo toca.
 *  5. Viene de una etapa posterior (muestra, seguimiento) → igual lo mueve.
 *  6. onPropuestaEnviada no lanza si algo falla.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindLead, mockFindStage, mockUpdateSet, mockUpdateWhere, mockInsertValues, mockPublish } = vi.hoisted(() => ({
  mockFindLead: vi.fn(),
  mockFindStage: vi.fn(),
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
  moverLeadAPropuestaEnviada,
  onPropuestaEnviada,
  SLUG_ETAPA_PROPUESTA_ENVIADA,
} from '@/lib/leads/propuesta-enviada'

const STAGE_ID = 'stage-propuesta'
const LEAD = { id: 'lead-1', stageId: 'stage-contactado', isOpen: true, assignedTo: 'agente-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockFindLead.mockResolvedValue(LEAD)
  mockFindStage.mockResolvedValue({ id: STAGE_ID })
})

describe('moverLeadAPropuestaEnviada', () => {
  it('usa el slug fijo del seed del pipeline', () => {
    expect(SLUG_ETAPA_PROPUESTA_ENVIADA).toBe('propuesta')
  })

  it('caso feliz: cambia de etapa, deja stage_changed y avisa por realtime', async () => {
    const r = await moverLeadAPropuestaEnviada('lead-1', 'vendedor-1', 'prop-9')
    expect(r).toEqual({ etapaMovida: true, stageId: STAGE_ID })

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({ stageId: STAGE_ID })

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      leadId: 'lead-1',
      userId: 'vendedor-1',
      action: 'stage_changed',
      metadata: { fromStageId: 'stage-contactado', toStageId: STAGE_ID, motivo: 'propuesta_enviada', propuestaId: 'prop-9' },
    })

    expect(mockPublish).toHaveBeenCalledWith({
      type: 'lead_updated',
      leadId: 'lead-1',
      assignedTo: 'agente-1',
      oldAssigned: 'agente-1',
      stageId: STAGE_ID,
      oldStageId: 'stage-contactado',
    })
  })

  it('ya está en "Propuesta enviada" → no hace nada', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, stageId: STAGE_ID })
    const r = await moverLeadAPropuestaEnviada('lead-1', 'u', 'p')
    expect(r).toEqual({ etapaMovida: false, stageId: STAGE_ID })
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('lead cerrado o inexistente → no lo toca', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, isOpen: false })
    expect(await moverLeadAPropuestaEnviada('lead-1', 'u', 'p')).toEqual({ etapaMovida: false, stageId: null })
    mockFindLead.mockResolvedValue(undefined)
    expect(await moverLeadAPropuestaEnviada('lead-1', 'u', 'p')).toEqual({ etapaMovida: false, stageId: null })
    expect(mockFindStage).not.toHaveBeenCalled()
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('etapa inexistente → no lo toca', async () => {
    mockFindStage.mockResolvedValue(undefined)
    const r = await moverLeadAPropuestaEnviada('lead-1', 'u', 'p')
    expect(r).toEqual({ etapaMovida: false, stageId: null })
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('desde una etapa posterior (muestra enviada, seguimiento) igual lo mueve', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, stageId: 'stage-muestra' })
    const r = await moverLeadAPropuestaEnviada('lead-1', 'u', 'p')
    expect(r.etapaMovida).toBe(true)
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({ metadata: { fromStageId: 'stage-muestra', toStageId: STAGE_ID } })
  })
})

describe('onPropuestaEnviada', () => {
  it('delega y devuelve el resultado', async () => {
    const r = await onPropuestaEnviada('lead-1', 'u', 'p')
    expect(r.etapaMovida).toBe(true)
  })

  it('si algo falla no lanza (best-effort)', async () => {
    mockFindLead.mockRejectedValue(new Error('db caída'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await onPropuestaEnviada('lead-1', 'u', 'p')
    expect(r).toEqual({ etapaMovida: false, stageId: null })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

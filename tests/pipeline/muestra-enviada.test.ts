/**
 * moverLeadAMuestraEnviada — el lead pasa a la etapa "Muestra enviada" al
 * cargar la muestra CDA.
 *
 *  1. Si la etapa no existe en el pipeline → no hace nada.
 *  2. Si el lead ya está en esa etapa → no hace nada.
 *  3. Si el lead está cerrado → no lo reabre ni lo mueve.
 *  4. Caso feliz → actualiza stageId, loguea stage_changed con motivo y
 *     publica el evento realtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindStage, mockUpdateSet, mockUpdateWhere, mockInsertValues, mockPublish } = vi.hoisted(() => ({
  mockFindStage: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue(undefined),
  mockInsertValues: vi.fn().mockResolvedValue(undefined),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/db', () => ({
  db: {
    query: { pipelineStages: { findFirst: mockFindStage } },
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

import { moverLeadAMuestraEnviada, SLUG_ETAPA_MUESTRA_ENVIADA } from '@/lib/leads/muestra-enviada'

const STAGE_ID = 'stage-muestra'
const LEAD = { id: 'lead-1', stageId: 'stage-nuevo', isOpen: true, assignedTo: 'agente-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockFindStage.mockResolvedValue({ id: STAGE_ID })
})

describe('moverLeadAMuestraEnviada', () => {
  it('usa el slug fijo muestra-enviada', () => {
    expect(SLUG_ETAPA_MUESTRA_ENVIADA).toBe('muestra-enviada')
  })

  it('si la etapa no existe no toca el lead', async () => {
    mockFindStage.mockResolvedValue(undefined)
    const r = await moverLeadAMuestraEnviada(LEAD, 'admin')
    expect(r).toEqual({ movido: false, stageId: null })
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('si el lead ya está en la etapa no hace nada', async () => {
    const r = await moverLeadAMuestraEnviada({ ...LEAD, stageId: STAGE_ID }, 'admin')
    expect(r).toEqual({ movido: false, stageId: STAGE_ID })
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('si el lead está cerrado no lo mueve', async () => {
    const r = await moverLeadAMuestraEnviada({ ...LEAD, isOpen: false }, 'admin')
    expect(r).toEqual({ movido: false, stageId: STAGE_ID })
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('caso feliz: cambia la etapa, loguea y publica el evento', async () => {
    const r = await moverLeadAMuestraEnviada(LEAD, 'admin')
    expect(r).toEqual({ movido: true, stageId: STAGE_ID })

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({ stageId: STAGE_ID })

    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      leadId: 'lead-1',
      userId: 'admin',
      action: 'stage_changed',
      metadata: { fromStageId: 'stage-nuevo', toStageId: STAGE_ID, motivo: 'muestra_creada' },
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
})

/**
 * PUT / DELETE /api/leads/[id]/recordatorio — recordatorio de llamada del lead.
 *
 *  1. Sin sesión → 401. Sin acceso al lead → 403.
 *  2. id que no es UUID → 400 "ID inválido".
 *  3. Fecha inválida → 400 sin tocar la DB.
 *  4. PUT feliz: guarda fecha, nota y quién lo puso; deja nota de sistema.
 *  5. PUT con nota vacía → nota null. Lead inexistente → 404.
 *  6. DELETE sin recordatorio → no toca nada.
 *  7. DELETE feliz: limpia los tres campos y deja nota de "cumplido".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthzError } from '@/lib/errors'

const {
  mockAuth,
  mockCanAccess,
  mockFindLead,
  mockUpdateSet,
  mockReturning,
  mockInsertValues,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCanAccess: vi.fn(),
  mockFindLead: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockReturning: vi.fn(),
  mockInsertValues: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccess }))
vi.mock('@/db', () => ({
  db: {
    query: { leads: { findFirst: mockFindLead } },
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values)
        return { where: () => ({ returning: mockReturning }) }
      },
    }),
    insert: () => ({ values: mockInsertValues }),
  },
}))

import { PUT, DELETE } from '@/app/api/leads/[id]/recordatorio/route'

const LEAD_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function put(id: string, body: unknown) {
  return PUT(
    new NextRequest(`http://localhost/api/leads/${id}/recordatorio`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(id),
  )
}

function del(id: string) {
  return DELETE(new NextRequest(`http://localhost/api/leads/${id}/recordatorio`, { method: 'DELETE' }), ctx(id))
}

function notaInsertada() {
  return mockInsertValues.mock.calls[0]![0] as { leadId: string; userId: string; action: string; metadata: Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID, role: 'vendedor', name: 'Teo' } })
  mockCanAccess.mockResolvedValue(undefined)
  mockFindLead.mockResolvedValue({ id: LEAD_ID, recordatorioAt: null, recordatorioNota: null })
  mockReturning.mockResolvedValue([{ recordatorioAt: '2026-11-03', recordatorioNota: 'Arrancan en noviembre' }])
  mockInsertValues.mockResolvedValue(undefined)
})

describe('PUT /api/leads/[id]/recordatorio', () => {
  it('sin sesión → 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await put(LEAD_ID, { fecha: '2026-11-03' })
    expect(res.status).toBe(401)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('sin acceso al lead → 403', async () => {
    mockCanAccess.mockRejectedValue(new AuthzError('No tenés acceso a este lead'))
    const res = await put(LEAD_ID, { fecha: '2026-11-03' })
    expect(res.status).toBe(403)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('id que no es UUID → 400', async () => {
    const res = await put('no-es-uuid', { fecha: '2026-11-03' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'ID inválido' })
  })

  it('fecha inválida → 400 sin tocar la DB', async () => {
    for (const fecha of ['2026-02-30', '03/11/2026', '', undefined]) {
      const res = await put(LEAD_ID, { fecha })
      expect(res.status).toBe(400)
    }
    expect(mockFindLead).not.toHaveBeenCalled()
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('caso feliz: guarda fecha, nota y quién; deja nota de sistema', async () => {
    const res = await put(LEAD_ID, { fecha: '2026-11-03', nota: '  Arrancan en noviembre  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { recordatorioAt: '2026-11-03', recordatorioNota: 'Arrancan en noviembre' } })

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({
      recordatorioAt: '2026-11-03',
      recordatorioNota: 'Arrancan en noviembre',
      recordatorioPor: USER_ID,
    })

    const nota = notaInsertada()
    expect(nota).toMatchObject({ leadId: LEAD_ID, userId: USER_ID, action: 'note_added' })
    expect(nota.metadata).toMatchObject({
      sistema: true,
      motivo: 'recordatorio',
      fecha: '2026-11-03',
      nota: 'Arrancan en noviembre',
      texto: 'Recordatorio para llamar el 03/11/2026: Arrancan en noviembre',
    })
  })

  it('nota vacía → null', async () => {
    const res = await put(LEAD_ID, { fecha: '2026-11-03', nota: '   ' })
    expect(res.status).toBe(200)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({ recordatorioNota: null })
    expect(notaInsertada().metadata['texto']).toBe('Recordatorio para llamar el 03/11/2026')
  })

  it('lead inexistente → 404', async () => {
    mockFindLead.mockResolvedValue(undefined)
    const res = await put(LEAD_ID, { fecha: '2026-11-03' })
    expect(res.status).toBe(404)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/leads/[id]/recordatorio', () => {
  it('sin recordatorio → no toca nada', async () => {
    const res = await del(LEAD_ID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: null })
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('caso feliz: limpia el recordatorio y deja nota de cumplido', async () => {
    mockFindLead.mockResolvedValue({ id: LEAD_ID, recordatorioAt: '2026-09-01', recordatorioNota: 'Pedir precio' })
    const res = await del(LEAD_ID)
    expect(res.status).toBe(200)

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet.mock.calls[0]![0]).toMatchObject({
      recordatorioAt: null,
      recordatorioNota: null,
      recordatorioPor: null,
    })

    const nota = notaInsertada()
    expect(nota).toMatchObject({ leadId: LEAD_ID, userId: USER_ID, action: 'note_added' })
    expect(nota.metadata).toMatchObject({
      sistema: true,
      motivo: 'recordatorio_cumplido',
      fecha: '2026-09-01',
      texto: 'Recordatorio cumplido (01/09/2026: Pedir precio)',
    })
  })

  it('id que no es UUID → 400', async () => {
    const res = await del('x')
    expect(res.status).toBe(400)
  })
})

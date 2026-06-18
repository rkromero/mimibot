/**
 * Tests para POST /api/clientes/[id]/visitas
 *
 * Cobertura:
 *  1. 401 sin sesión
 *  2. caso normal con geo → 201, actividad visita/completada, fechaCompletada,
 *     asignadoA = usuario actual, lat/lng/precision persistidos
 *  3. sin geo → 201, lat/lng/geoPrecision null
 *  4. reprogramar SIN proximaVisita → 400
 *  5. reprogramar CON proximaVisita → 201, 2 actividades (completada + pendiente futura)
 *  6. sin acceso al cliente → 403
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAuthFn, mockTransaction, mockCanAccess, mockValidateUuid } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockTransaction: vi.fn(),
  mockCanAccess: vi.fn(),
  mockValidateUuid: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({ db: { transaction: mockTransaction } }))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: mockCanAccess }))
vi.mock('@/lib/api/validate-params', () => ({ validateUuidParam: mockValidateUuid }))

import { POST } from '@/app/api/clientes/[id]/visitas/route'
import { AuthzError } from '@/lib/errors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLIENTE_ID = '550e8400-e29b-41d4-a716-446655440000'
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

type Inserted = Record<string, unknown>

function makeTx(store: Inserted[]) {
  return {
    insert: () => ({
      values: (v: Inserted) => ({
        returning: async () => {
          store.push(v)
          return [{ id: `act-${store.length}`, ...v }]
        },
      }),
    }),
  }
}

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/clientes/${CLIENTE_ID}/visitas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: CLIENTE_ID }) }

let inserted: Inserted[] = []

beforeEach(() => {
  vi.clearAllMocks()
  inserted = []
  mockAuthFn.mockResolvedValue({ user: { id: USER_ID, role: 'agent' } })
  mockValidateUuid.mockReturnValue(null)
  mockCanAccess.mockResolvedValue(undefined)
  mockTransaction.mockImplementation(async (cb: (tx: ReturnType<typeof makeTx>) => unknown) => cb(makeTx(inserted)))
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/clientes/[id]/visitas', () => {
  it('401 sin sesión', async () => {
    mockAuthFn.mockResolvedValueOnce(null)
    const res = await POST(makeReq({ resultado: 'compro' }), ctx)
    expect(res.status).toBe(401)
  })

  it('caso normal con geo → 201, visita completada con resultado y geolocalización', async () => {
    const res = await POST(
      makeReq({ resultado: 'compro', notas: 'Cerró pedido', lat: -34.603722, lng: -58.381592, precision: 12.5 }),
      ctx,
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Array<Record<string, unknown>> }

    expect(body.data).toHaveLength(1)
    const v = body.data[0]!
    expect(v.tipo).toBe('visita')
    expect(v.estado).toBe('completada')
    expect(v.resultado).toBe('compro')
    expect(v.titulo).toBe('Visita - Compró')
    expect(v.fechaCompletada).toBeTruthy()
    expect(v.asignadoA).toBe(USER_ID)
    expect(v.creadoPor).toBe(USER_ID)
    expect(v.lat).toBe('-34.603722')
    expect(v.lng).toBe('-58.381592')
    expect(v.geoPrecision).toBe('12.5')
    // No se crea una segunda actividad
    expect(inserted).toHaveLength(1)
  })

  it('sin geo → 201, lat/lng/geoPrecision quedan null', async () => {
    const res = await POST(makeReq({ resultado: 'no_estaba' }), ctx)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Array<Record<string, unknown>> }

    expect(body.data).toHaveLength(1)
    const v = body.data[0]!
    expect(v.estado).toBe('completada')
    expect(v.resultado).toBe('no_estaba')
    expect(v.lat).toBeNull()
    expect(v.lng).toBeNull()
    expect(v.geoPrecision).toBeNull()
  })

  it('reprogramar sin proximaVisita → 400', async () => {
    const res = await POST(makeReq({ resultado: 'reprogramar' }), ctx)
    expect(res.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('reprogramar con proximaVisita → 201 con visita completada + visita pendiente futura', async () => {
    const proxima = '2026-07-01T10:00:00.000Z'
    const res = await POST(makeReq({ resultado: 'reprogramar', proximaVisita: proxima }), ctx)
    expect(res.status).toBe(201)
    const body = await res.json() as { data: Array<Record<string, unknown>> }

    expect(body.data).toHaveLength(2)

    const completada = body.data[0]!
    expect(completada.estado).toBe('completada')
    expect(completada.resultado).toBe('reprogramar')
    expect(completada.fechaCompletada).toBeTruthy()

    const pendiente = body.data[1]!
    expect(pendiente.tipo).toBe('visita')
    expect(pendiente.estado).toBe('pendiente')
    expect(pendiente.asignadoA).toBe(USER_ID)
    expect(new Date(pendiente.fechaProgramada as string).toISOString()).toBe(proxima)
  })

  it('sin acceso al cliente → 403', async () => {
    mockCanAccess.mockRejectedValueOnce(new AuthzError('No tenés acceso a este cliente'))
    const res = await POST(makeReq({ resultado: 'compro' }), ctx)
    expect(res.status).toBe(403)
  })
})

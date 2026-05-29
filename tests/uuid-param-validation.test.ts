/**
 * Tests for UUID parameter validation
 *
 * Coverage:
 * 1. validateUuidParam helper unit tests
 * 2. Handler-level smoke tests: non-UUID id → 400 { error: 'ID inválido' }
 *    for every modified route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { validateUuidParam } from '@/lib/api/validate-params'

// ─── Mock shared deps (auth, db, services) ────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'aaaaaaaa-0000-0000-0000-000000000001', role: 'admin', name: 'Admin' },
  }),
}))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/authz', () => ({
  requireAdmin: vi.fn(),
  canAccessLead: vi.fn(),
  withAdminAuth: vi.fn(async (fn: () => unknown) => fn()),
}))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: vi.fn() }))
vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: vi.fn().mockResolvedValue({
    role: 'admin', userId: 'aaaaaaaa-0000-0000-0000-000000000001',
    territoriosGestionados: [], agentesVisibles: [],
  }),
}))
vi.mock('@/lib/territorios/territorios.service', () => ({
  getTerritorio: vi.fn(), editarTerritorio: vi.fn(), darDeBajaTerritorio: vi.fn(),
  getAgenteActivo: vi.fn().mockResolvedValue(null), asignarAgente: vi.fn(),
  desasignarAgente: vi.fn(), asignarGerente: vi.fn(), quitarGerente: vi.fn(),
}))
vi.mock('@/lib/delete/delete.service', () => ({
  deleteCliente: vi.fn(), deletePedido: vi.fn(), deleteProducto: vi.fn(),
  deleteLead: vi.fn(), deleteMovimientoCC: vi.fn(),
}))
vi.mock('@/lib/metas/metas.service', () => ({
  getMetaWithVendedor: vi.fn().mockResolvedValue(null),
  isMesBloqueable: vi.fn(), updateMetaFutura: vi.fn(), updateMetaVigente: vi.fn(),
}))
vi.mock('@/lib/territorios/asignacion.service', () => ({
  sincronizarAgenteEnTerritorioClientes: vi.fn(), moverClienteATerritorio: vi.fn(),
}))
vi.mock('@/lib/followup/engine', () => ({
  scheduleFollowUp: vi.fn(), cancelFollowUp: vi.fn(),
}))
vi.mock('@/lib/realtime/broker', () => ({ emitLeadEvent: vi.fn() }))
vi.mock('@/lib/pdf/pdf.service', () => ({ emitirDocumento: vi.fn() }))
vi.mock('@/lib/clientes/actividad.service', () => ({ evaluarClienteNuevo: vi.fn() }))
vi.mock('@/lib/clientes/conversion', () => ({ convertirLeadACliente: vi.fn() }))
vi.mock('@/lib/pedidos/service', () => ({
  confirmarPedido: vi.fn(), aprobarPedido: vi.fn(), revertirPedidoAAprobacion: vi.fn(),
}))
vi.mock('@/lib/cuenta-corriente/pago.service', () => ({ registrarPago: vi.fn() }))
vi.mock('@/lib/api/pagination', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 50, sortBy: 'createdAt', sortDir: 'desc' }),
}))
vi.mock('@/lib/dates', () => ({ parseFechaAR: vi.fn(), formatFechaAR: vi.fn() }))

// ─── validateUuidParam — unit tests ───────────────────────────────────────────
describe('validateUuidParam', () => {
  it('returns null for a valid v4 UUID', () => {
    expect(validateUuidParam('550e8400-e29b-41d4-a716-446655440000')).toBeNull()
  })

  it('returns null for nil UUID', () => {
    expect(validateUuidParam('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('returns 400 NextResponse for plain text', () => {
    const res = validateUuidParam('lalala')
    expect(res).toBeInstanceOf(NextResponse)
    expect(res?.status).toBe(400)
  })

  it('returns 400 for numeric string', () => {
    const res = validateUuidParam('123')
    expect(res?.status).toBe(400)
  })

  it('returns 400 for empty string', () => {
    const res = validateUuidParam('')
    expect(res?.status).toBe(400)
  })

  it('error body is { error: "ID inválido" }', async () => {
    const res = validateUuidParam('not-a-uuid')!
    const body = await res.json()
    expect(body).toEqual({ error: 'ID inválido' })
  })
})

// ─── Helper — build a fake Request with a body ────────────────────────────────
function makeReq(method = 'GET', body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ─── Helper — build route params ─────────────────────────────────────────────
function p(id: string) { return { params: Promise.resolve({ id }) } }
function pLeadId(leadId: string) { return { params: Promise.resolve({ leadId }) } }
function pIdGerente(id: string, gerenteId: string) {
  return { params: Promise.resolve({ id, gerenteId }) }
}
function pIdMovimiento(id: string, movimientoId: string) {
  return { params: Promise.resolve({ id, movimientoId }) }
}

const BAD_ID = 'lalala'
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const NULL_UUID = '00000000-0000-0000-0000-000000000000'

async function expectBadId(handler: () => Promise<NextResponse>) {
  const res = await handler()
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body).toEqual({ error: 'ID inválido' })
}

// ─── /api/clientes/[id] ───────────────────────────────────────────────────────
describe('GET /api/clientes/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/clientes/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PATCH /api/clientes/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/clientes/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/clientes/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/clientes/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/pedidos/[id] ────────────────────────────────────────────────────────
describe('GET /api/pedidos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/pedidos/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PATCH /api/pedidos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/pedidos/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/pedidos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/pedidos/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/productos/[id] ──────────────────────────────────────────────────────
describe('GET /api/productos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/productos/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PATCH /api/productos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/productos/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/productos/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/productos/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/territorios/[id] ────────────────────────────────────────────────────
describe('GET /api/territorios/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/territorios/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PUT /api/territorios/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PUT } = await import('@/app/api/territorios/[id]/route')
    await expectBadId(() => PUT(makeReq('PUT', { nombre: 'x' }), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/territorios/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/territorios/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/leads/[id] ─────────────────────────────────────────────────────────
describe('GET /api/leads/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/leads/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PATCH /api/leads/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/leads/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/leads/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/leads/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/users/[id] ─────────────────────────────────────────────────────────
describe('PATCH /api/users/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/actividades/[id] ───────────────────────────────────────────────────
describe('PATCH /api/actividades/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/actividades/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/movimientos-cc/[id] ────────────────────────────────────────────────
describe('DELETE /api/movimientos-cc/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/movimientos-cc/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/metas/[id] ─────────────────────────────────────────────────────────
describe('GET /api/metas/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/metas/[id]/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('PUT /api/metas/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PUT } = await import('@/app/api/metas/[id]/route')
    await expectBadId(() => PUT(makeReq('PUT', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/stages/[id] ────────────────────────────────────────────────────────
describe('PATCH /api/stages/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/stages/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/stages/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/stages/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/settings/followup-templates/[id] ───────────────────────────────────
describe('PATCH /api/settings/followup-templates/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { PATCH } = await import('@/app/api/settings/followup-templates/[id]/route')
    await expectBadId(() => PATCH(makeReq('PATCH', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/settings/followup-templates/[id]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/settings/followup-templates/[id]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/conversations/[id]/messages ────────────────────────────────────────
describe('GET /api/conversations/[id]/messages', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/conversations/[id]/messages/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('POST /api/conversations/[id]/messages', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/conversations/[id]/messages/route')
    await expectBadId(() => POST(makeReq('POST', { body: 'x', contentType: 'internal_note', conversationId: VALID_UUID }), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/conversations/[id]/read ────────────────────────────────────────────
describe('POST /api/conversations/[id]/read', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/conversations/[id]/read/route')
    await expectBadId(() => POST(makeReq('POST'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/leads/[id]/activity ────────────────────────────────────────────────
describe('GET /api/leads/[id]/activity', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/leads/[id]/activity/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/followup/[leadId] ──────────────────────────────────────────────────
describe('POST /api/followup/[leadId]', () => {
  it('returns 400 for non-UUID leadId', async () => {
    const { POST } = await import('@/app/api/followup/[leadId]/route')
    await expectBadId(() => POST(makeReq('POST', { reason: 'manual' }), pLeadId(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/followup/[leadId]', () => {
  it('returns 400 for non-UUID leadId', async () => {
    const { DELETE } = await import('@/app/api/followup/[leadId]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), pLeadId(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/metas/[id]/corregir ────────────────────────────────────────────────
describe('POST /api/metas/[id]/corregir', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/metas/[id]/corregir/route')
    await expectBadId(() => POST(makeReq('POST', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/pedidos/[id]/documentos ────────────────────────────────────────────
describe('POST /api/pedidos/[id]/documentos', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/pedidos/[id]/documentos/route')
    await expectBadId(() => POST(makeReq('POST', { tipo: 'remito' }), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/territorios/[id]/agente ────────────────────────────────────────────
describe('POST /api/territorios/[id]/agente', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/territorios/[id]/agente/route')
    await expectBadId(() => POST(makeReq('POST', { agenteId: VALID_UUID }), p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('DELETE /api/territorios/[id]/agente', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/territorios/[id]/agente/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/territorios/[id]/gerentes ──────────────────────────────────────────
describe('POST /api/territorios/[id]/gerentes', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/territorios/[id]/gerentes/route')
    await expectBadId(() => POST(makeReq('POST', { gerenteId: VALID_UUID }), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/territorios/[id]/gerentes/[gerenteId] ──────────────────────────────
describe('DELETE /api/territorios/[id]/gerentes/[gerenteId]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/territorios/[id]/gerentes/[gerenteId]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), pIdGerente(BAD_ID, VALID_UUID)) as Promise<NextResponse>)
  })
  it('returns 400 for non-UUID gerenteId', async () => {
    const { DELETE } = await import('@/app/api/territorios/[id]/gerentes/[gerenteId]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), pIdGerente(VALID_UUID, BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/territorios/[id]/historial ─────────────────────────────────────────
describe('GET /api/territorios/[id]/historial', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/territorios/[id]/historial/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/actividades ──────────────────────────────────────────
describe('GET /api/clientes/[id]/actividades', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/clientes/[id]/actividades/route')
    const req = new NextRequest('http://localhost/api/test?page=1&limit=20')
    await expectBadId(() => GET(req, p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('POST /api/clientes/[id]/actividades', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/clientes/[id]/actividades/route')
    await expectBadId(() => POST(makeReq('POST', {}), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/cuenta-corriente ─────────────────────────────────────
describe('GET /api/clientes/[id]/cuenta-corriente', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/clientes/[id]/cuenta-corriente/route')
    const req = new NextRequest('http://localhost/api/test?page=1')
    await expectBadId(() => GET(req, p(BAD_ID)) as Promise<NextResponse>)
  })
})
describe('POST /api/clientes/[id]/cuenta-corriente', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/clientes/[id]/cuenta-corriente/route')
    await expectBadId(() => POST(makeReq('POST', { monto: 100 }), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/cuenta-corriente/[movimientoId] ──────────────────────
describe('DELETE /api/clientes/[id]/cuenta-corriente/[movimientoId]', () => {
  it('returns 400 for non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/clientes/[id]/cuenta-corriente/[movimientoId]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), pIdMovimiento(BAD_ID, VALID_UUID)) as Promise<NextResponse>)
  })
  it('returns 400 for non-UUID movimientoId', async () => {
    const { DELETE } = await import('@/app/api/clientes/[id]/cuenta-corriente/[movimientoId]/route')
    await expectBadId(() => DELETE(makeReq('DELETE'), pIdMovimiento(VALID_UUID, BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/historial-territorio ─────────────────────────────────
describe('GET /api/clientes/[id]/historial-territorio', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/clientes/[id]/historial-territorio/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/territorio ───────────────────────────────────────────
describe('POST /api/clientes/[id]/territorio', () => {
  it('returns 400 for non-UUID id', async () => {
    const { POST } = await import('@/app/api/clientes/[id]/territorio/route')
    await expectBadId(() => POST(makeReq('POST', { territorioId: VALID_UUID }), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── /api/clientes/[id]/productos-habituales ─────────────────────────────────
describe('GET /api/clientes/[id]/productos-habituales', () => {
  it('returns 400 for non-UUID id', async () => {
    const { GET } = await import('@/app/api/clientes/[id]/productos-habituales/route')
    await expectBadId(() => GET(makeReq(), p(BAD_ID)) as Promise<NextResponse>)
  })
})

// ─── valid UUID but non-existent: should NOT return 400 (keep 404 behaviour) ─
// These tests assert the 400 guard does not fire for a proper UUID format;
// the mock layers return null / throw NotFoundError → handled downstream.
describe('validateUuidParam does not block valid-format UUIDs', () => {
  it('nil UUID passes through (404 from service layer)', () => {
    expect(validateUuidParam(NULL_UUID)).toBeNull()
  })
  it('standard v4 UUID passes through', () => {
    expect(validateUuidParam(VALID_UUID)).toBeNull()
  })
})

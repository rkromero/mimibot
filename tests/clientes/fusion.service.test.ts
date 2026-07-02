/**
 * Tests: fusión de clientes (lib/clientes/fusion.service.ts)
 *
 * Cobertura:
 *  1. targetId === sourceId → ValidationError, sin transacción
 *  2. source inexistente o borrado → NotFoundError
 *  3. Happy path: repunta pedidos/movimientos/actividades/historial al target,
 *     soft-delete del source, resumen con conteos correctos
 *  4. Conversación solo en source → se repunta al target
 *  5. Conversación en ambos → mensajes movidos y la de source queda clienteId=null
 *  6. leadId: target sin lead y source con lead → se copia y el source lo pierde
 *  7. Route POST: rol no admin → 403, no llega al servicio
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  clientes,
  pedidos,
  movimientosCC,
  actividadesCliente,
  historialTeritorioCliente,
  conversations,
  messages,
} from '@/db/schema'
import { ValidationError, NotFoundError } from '@/lib/errors'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockDb, mockTx, updateCalls, mockAuthFn } = vi.hoisted(() => {
  const updateCalls: { table: unknown; values: Record<string, unknown> }[] = []
  const mockTx = {
    update: vi.fn(),
    query: { conversations: { findFirst: vi.fn() } },
  }
  const mockDb = {
    query: { clientes: { findFirst: vi.fn() }, conversations: { findFirst: vi.fn() } },
    select: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }
  return { mockDb, mockTx, updateCalls, mockAuthFn: vi.fn() }
})

vi.mock('@/db', () => ({ db: mockDb }))
vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TARGET_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ID = '22222222-2222-4222-8222-222222222222'

function setupClientes(target: unknown, source: unknown) {
  mockDb.query.clientes.findFirst
    .mockResolvedValueOnce(target)
    .mockResolvedValueOnce(source)
}

// Configura tx.update: cada .set() se registra y .where() devuelve una promesa
// awaiteable que además expone .returning() con las filas indicadas por tabla.
function setupTxUpdate(returningByTable: Map<unknown, unknown[]>) {
  updateCalls.length = 0
  mockTx.update.mockImplementation((table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      updateCalls.push({ table, values })
      const rows = returningByTable.get(table) ?? []
      return {
        where: () => Object.assign(Promise.resolve(rows), {
          returning: () => Promise.resolve(rows),
        }),
      }
    },
  }))
}

function callsFor(table: unknown) {
  return updateCalls.filter((c) => c.table === table)
}

// ─── fusionarClientes ─────────────────────────────────────────────────────────

describe('fusionarClientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTxUpdate(new Map())
    mockTx.query.conversations.findFirst.mockResolvedValue(undefined)
  })

  it('1. target === source → ValidationError sin abrir transacción', async () => {
    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    await expect(fusionarClientes(TARGET_ID, TARGET_ID)).rejects.toThrow(ValidationError)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('2. source inexistente o borrado → NotFoundError', async () => {
    setupClientes({ id: TARGET_ID, leadId: null }, undefined)

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    await expect(fusionarClientes(TARGET_ID, SOURCE_ID)).rejects.toThrow(NotFoundError)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('3. repunta pedidos/movimientos/actividades/historial y soft-deletea el source', async () => {
    setupClientes({ id: TARGET_ID, leadId: null }, { id: SOURCE_ID, leadId: null })
    setupTxUpdate(new Map<unknown, unknown[]>([
      [pedidos, [{ id: 'p1' }, { id: 'p2' }]],
      [movimientosCC, [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]],
      [actividadesCliente, [{ id: 'a1' }]],
      [historialTeritorioCliente, []],
    ]))

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    expect(resumen).toMatchObject({
      pedidos: 2,
      movimientosCC: 3,
      actividades: 1,
      historialTerritorio: 0,
      mensajesMovidos: 0,
      conversacionMovida: false,
      leadCopiado: false,
    })

    // Repunte: todas las tablas apuntan al target
    expect(callsFor(pedidos)[0]?.values).toMatchObject({ clienteId: TARGET_ID })
    expect(callsFor(movimientosCC)[0]?.values).toMatchObject({ clienteId: TARGET_ID })
    expect(callsFor(actividadesCliente)[0]?.values).toMatchObject({ clienteId: TARGET_ID })
    expect(callsFor(historialTeritorioCliente)[0]?.values).toMatchObject({ clienteId: TARGET_ID })

    // Soft-delete del source (único update sobre clientes en este escenario)
    const clientesCalls = callsFor(clientes)
    expect(clientesCalls).toHaveLength(1)
    expect(clientesCalls[0]?.values['deletedAt']).toBeInstanceOf(Date)
  })

  it('4. conversación solo en source → se repunta al target', async () => {
    setupClientes({ id: TARGET_ID, leadId: null }, { id: SOURCE_ID, leadId: null })
    mockTx.query.conversations.findFirst
      .mockResolvedValueOnce({ id: 'conv-s', lastMessageAt: new Date(), unreadCount: 2 }) // source
      .mockResolvedValueOnce(undefined) // target no tiene

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    expect(resumen.conversacionMovida).toBe(true)
    expect(resumen.mensajesMovidos).toBe(0)
    const convCalls = callsFor(conversations)
    expect(convCalls).toHaveLength(1)
    expect(convCalls[0]?.values).toMatchObject({ clienteId: TARGET_ID })
  })

  it('5. conversación en ambos → mueve mensajes y desvincula la de source', async () => {
    setupClientes({ id: TARGET_ID, leadId: null }, { id: SOURCE_ID, leadId: null })
    setupTxUpdate(new Map<unknown, unknown[]>([
      [messages, [{ id: 'msg1' }, { id: 'msg2' }]],
    ]))
    mockTx.query.conversations.findFirst
      .mockResolvedValueOnce({ id: 'conv-s', lastMessageAt: new Date('2026-06-01'), unreadCount: 2 })
      .mockResolvedValueOnce({ id: 'conv-t', lastMessageAt: new Date('2026-05-01'), unreadCount: 1 })

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    expect(resumen.mensajesMovidos).toBe(2)
    expect(resumen.conversacionMovida).toBe(false)

    // La de target absorbe estado de bandeja; la de source queda sin cliente
    const convCalls = callsFor(conversations)
    expect(convCalls).toHaveLength(2)
    expect(convCalls[0]?.values).toMatchObject({
      unreadCount: 3,
      lastMessageAt: new Date('2026-06-01'),
    })
    expect(convCalls[1]?.values).toMatchObject({ clienteId: null })
  })

  it('6. leadId: target sin lead y source con lead → se copia y el source lo pierde', async () => {
    setupClientes({ id: TARGET_ID, leadId: null }, { id: SOURCE_ID, leadId: 'lead-1' })

    const { fusionarClientes } = await import('@/lib/clientes/fusion.service')
    const resumen = await fusionarClientes(TARGET_ID, SOURCE_ID)

    expect(resumen.leadCopiado).toBe(true)
    const clientesCalls = callsFor(clientes)
    expect(clientesCalls).toHaveLength(2)
    expect(clientesCalls[0]?.values).toMatchObject({ leadId: 'lead-1' }) // target
    expect(clientesCalls[1]?.values).toMatchObject({ leadId: null }) // source soft-delete
    expect(clientesCalls[1]?.values['deletedAt']).toBeInstanceOf(Date)
  })
})

// ─── Route: authz ─────────────────────────────────────────────────────────────

describe('POST /api/admin/clientes/fusionar — authz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTxUpdate(new Map())
    mockTx.query.conversations.findFirst.mockResolvedValue(undefined)
  })

  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/admin/clientes/fusionar', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('7. rol no admin → 403 sin tocar la base', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'g1', role: 'gerente', name: 'G', email: 'g@b.com', avatarColor: '#ccc' } })

    const { POST } = await import('@/app/api/admin/clientes/fusionar/route')
    const res = await POST(makeRequest({ targetId: TARGET_ID, sourceId: SOURCE_ID }))

    expect(res.status).toBe(403)
    expect(mockDb.query.clientes.findFirst).not.toHaveBeenCalled()
  })

  it('8. admin → 200 con el resumen de la fusión', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'adm', role: 'admin', name: 'A', email: 'a@b.com', avatarColor: '#ccc' } })
    setupClientes({ id: TARGET_ID, leadId: null }, { id: SOURCE_ID, leadId: null })

    const { POST } = await import('@/app/api/admin/clientes/fusionar/route')
    const res = await POST(makeRequest({ targetId: TARGET_ID, sourceId: SOURCE_ID }))

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { pedidos: number } }
    expect(body.data).toMatchObject({ pedidos: 0, conversacionMovida: false })
  })
})

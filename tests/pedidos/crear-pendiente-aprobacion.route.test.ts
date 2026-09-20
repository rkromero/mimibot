/**
 * POST /api/pedidos — todo pedido nace en 'pendiente_aprobacion', lo cargue
 * quien lo cargue. La aprobación (aunque la haga el mismo admin) es el paso
 * que crea los movimientos de cuenta corriente y stock.
 *
 *  1. Admin → crearComoPendienteAprobacion: true.
 *  2. Agente → crearComoPendienteAprobacion: true (como siempre).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn, mockGetSessionContext, mockClientesFindFirst, mockCrear } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockClientesFindFirst: vi.fn(),
  mockCrear: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetSessionContext }))
vi.mock('@/db', () => ({
  db: {
    query: {
      clientes: { findFirst: mockClientesFindFirst },
      pedidos: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  },
}))
vi.mock('@/lib/pedidos/service', () => ({
  crearPedidoConItems: mockCrear,
  confirmarPedido: vi.fn(),
  aprobarPedido: vi.fn(),
  revertirPedidoAAprobacion: vi.fn(),
}))
vi.mock('@/lib/authz/marcas', () => ({
  assertPuedeCargarProductos: vi.fn().mockResolvedValue(undefined),
  marcaVisibleFilter: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/whatsapp/notificaciones', () => ({ notificarPedidoCreado: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api/cache', () => ({ cachedJson: vi.fn() }))

import { POST } from '@/app/api/pedidos/route'

const CLIENTE_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const PRODUCTO_ID = 'bbbbbbbb-0000-4000-8000-000000000002'

function session(role: string) {
  return { user: { id: 'user-1', role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}
function ctx(role: string) {
  return { userId: 'user-1', role, territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [] }
}
function req() {
  return new NextRequest('http://localhost/api/pedidos', {
    method: 'POST',
    body: JSON.stringify({ clienteId: CLIENTE_ID, items: [{ productoId: PRODUCTO_ID, cantidad: 2 }] }),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClientesFindFirst.mockResolvedValue({ id: CLIENTE_ID, territorioId: null, expresoNombre: null, expresoDireccion: null })
  mockCrear.mockResolvedValue({ id: 'pedido-1', estado: 'pendiente_aprobacion', total: '200.00' })
})

describe('POST /api/pedidos — estado inicial', () => {
  it('admin: el pedido nace pendiente de aprobación aunque lo apruebe él mismo', async () => {
    mockAuthFn.mockResolvedValue(session('admin'))
    mockGetSessionContext.mockResolvedValue(ctx('admin'))

    const res = await POST(req())

    expect(res.status).toBe(201)
    expect(mockCrear).toHaveBeenCalledTimes(1)
    expect(mockCrear.mock.calls[0]![6]).toMatchObject({ crearComoPendienteAprobacion: true })
    const body = await res.json() as { data: { estado: string } }
    expect(body.data.estado).toBe('pendiente_aprobacion')
  })

  it('agente: también pendiente de aprobación', async () => {
    mockAuthFn.mockResolvedValue(session('agent'))
    mockGetSessionContext.mockResolvedValue(ctx('agent'))

    const res = await POST(req())

    expect(res.status).toBe(201)
    expect(mockCrear.mock.calls[0]![6]).toMatchObject({ crearComoPendienteAprobacion: true })
  })
})

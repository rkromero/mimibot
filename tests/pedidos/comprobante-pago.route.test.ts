/**
 * Tests para GET/POST/DELETE /api/pedidos/[id]/comprobante-pago
 *
 * Cobertura:
 *  GET
 *   1. 401 sin sesión
 *   2. 403 para vendedor
 *   3. 403 para agent que no es dueño
 *   4. 200 con {url: null, missingComprobante: true} cuando no hay comprobante
 *   5. 200 con signed URL cuando existe comprobante (agent dueño)
 *   6. 200 con signed URL para admin
 *
 *  POST
 *   7. 401 sin sesión
 *   8. 403 para vendedor
 *   9. 403 para agent que no es dueño
 *  10. 400 para agent con pedido en estado confirmado
 *  11. 400 para agent con pedido en listo_para_repartir
 *  12. 200 para agent con pedido en pendiente
 *  13. 200 para agent con pedido en pendiente_aprobacion
 *  14. 200 para admin con pedido en confirmado (bypass estado)
 *  15. 400 cuando no se envía archivo
 *  16. 400 cuando el tipo de archivo no es permitido
 *
 *  DELETE
 *  17. 401 sin sesión
 *  18. 403 para vendedor
 *  19. 400 para agent con pedido en confirmado
 *  20. 200 para agent con pedido en pendiente
 *  21. 200 para admin con pedido en confirmado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockFindPedido,
  mockFindCliente,
  mockDbUpdate,
  mockR2Send,
  mockGetSignedUrl,
  mockValidateUuidParam,
} = vi.hoisted(() => {
  const dbUpdateChain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue([]),
  }
  dbUpdateChain.set.mockReturnValue(dbUpdateChain)

  return {
    mockAuthFn: vi.fn(),
    mockFindPedido: vi.fn(),
    mockFindCliente: vi.fn(),
    mockDbUpdate: vi.fn().mockReturnValue(dbUpdateChain),
    mockR2Send: vi.fn().mockResolvedValue({}),
    mockGetSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed'),
    mockValidateUuidParam: vi.fn().mockReturnValue(null),
  }
})

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: mockFindPedido },
      clientes: { findFirst: mockFindCliente },
    },
    update: mockDbUpdate,
  },
}))

vi.mock('@/lib/r2/client', () => ({
  r2Client: { send: mockR2Send },
  R2_BUCKET: 'test-bucket',
}))

vi.mock('@/lib/r2/signed-url', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: vi.fn((user: { id: string; role: string }) =>
    Promise.resolve({
      userId: user.id,
      role: user.role,
      territoriosGestionados: [],
      agentesVisibles: [],
    })
  ),
}))

vi.mock('@/lib/errors', () => {
  class AuthzError extends Error {
    statusCode = 403
    constructor(m = 'No autorizado') { super(m); this.name = 'AuthzError' }
  }
  class NotFoundError extends Error {
    statusCode = 404
    constructor(r: string) { super(`${r} no encontrado`); this.name = 'NotFoundError' }
  }
  class ValidationError extends Error {
    statusCode = 400
    constructor(m: string) { super(m); this.name = 'ValidationError' }
  }
  return {
    AuthzError, NotFoundError, ValidationError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: mockValidateUuidParam,
}))

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn().mockImplementation((args: unknown) => args),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CLIENTE_ID = 'cccccccc-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const OTHER_USER_ID = 'dddddddd-0000-0000-0000-000000000001'

function makeSession(role: string, id = USER_ID) {
  return { user: { id, role, name: 'Test', email: 'test@test.com' } }
}

function makePedido(estado: string, comprobantePagoUrl: string | null = null) {
  return {
    id: PEDIDO_ID,
    vendedorId: USER_ID,
    clienteId: CLIENTE_ID,
    estado,
    comprobantePagoUrl,
    deletedAt: null,
  }
}

function makeGetRequest() {
  return new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}/comprobante-pago`, {
    method: 'GET',
  })
}

function makeDeleteRequest() {
  return new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}/comprobante-pago`, {
    method: 'DELETE',
  })
}

async function makePostRequest(includeFile = true, mimeType = 'image/png') {
  const formData = new FormData()
  if (includeFile) {
    const blob = new Blob(['fake-image-data'], { type: mimeType })
    const file = new File([blob], `test.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`, { type: mimeType })
    formData.append('file', file)
  }
  return new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}/comprobante-pago`, {
    method: 'POST',
    body: formData,
  })
}

const routeParams = { params: Promise.resolve({ id: PEDIDO_ID }) }

// ─── Tests: GET ───────────────────────────────────────────────────────────────

describe('GET /api/pedidos/[id]/comprobante-pago', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUuidParam.mockReturnValue(null)
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })
  })

  it('1. 401 sin sesión', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(401)
  })

  it('2. 403 para vendedor', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(403)
  })

  it('3. 403 para agent que no es dueño', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent', OTHER_USER_ID))
    mockFindPedido.mockResolvedValue(makePedido('pendiente'))
    mockFindCliente.mockResolvedValue(null) // No es dueño
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(403)
  })

  it('4. 200 con missingComprobante:true cuando no hay comprobante', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente', null))
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: null; missingComprobante: boolean }
    expect(body.missingComprobante).toBe(true)
    expect(body.url).toBeNull()
  })

  it('5. 200 con signed URL para agent dueño cuando existe comprobante', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente', 'comprobantes-pago/123-abc.png'))
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json() as { url: string; missingComprobante: boolean }
    expect(body.missingComprobante).toBe(false)
    expect(body.url).toBe('https://r2.example.com/signed')
    expect(mockGetSignedUrl).toHaveBeenCalledWith('comprobantes-pago/123-abc.png')
  })

  it('6. 200 con signed URL para admin', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado', 'comprobantes-pago/123-abc.png'))
    const { GET } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await GET(makeGetRequest(), routeParams)
    expect(res.status).toBe(200)
    expect(mockGetSignedUrl).toHaveBeenCalled()
  })
})

// ─── Tests: POST ──────────────────────────────────────────────────────────────

describe('POST /api/pedidos/[id]/comprobante-pago', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUuidParam.mockReturnValue(null)
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })
    mockR2Send.mockResolvedValue({})
    // Simulate R2 env vars present
    process.env['R2_ACCOUNT_ID'] = 'acc'
    process.env['R2_ACCESS_KEY_ID'] = 'key'
    process.env['R2_SECRET_ACCESS_KEY'] = 'secret'
  })

  it('7. 401 sin sesión', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(401)
  })

  it('8. 403 para vendedor', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(403)
  })

  it('9. 403 para agent que no es dueño', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent', OTHER_USER_ID))
    mockFindPedido.mockResolvedValue(makePedido('pendiente'))
    mockFindCliente.mockResolvedValue(null)
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(403)
  })

  it.each(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])(
    '10-11. 400 para agent con pedido en estado %s',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('agent'))
      mockFindPedido.mockResolvedValue(makePedido(estado))
      const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
      const res = await POST(await makePostRequest(), routeParams)
      expect(res.status).toBe(400)
      expect(mockR2Send).not.toHaveBeenCalled()
    },
  )

  it('12. 200 para agent con pedido en pendiente', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json() as { r2Key: string }
    expect(body.r2Key).toMatch(/^comprobantes-pago\//)
    expect(mockR2Send).toHaveBeenCalled()
  })

  it('13. 200 para agent con pedido en pendiente_aprobacion', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente_aprobacion'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(200)
    expect(mockR2Send).toHaveBeenCalled()
  })

  it('14. 200 para admin con pedido en confirmado (bypass estado)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(), routeParams)
    expect(res.status).toBe(200)
    expect(mockR2Send).toHaveBeenCalled()
  })

  it('15. 400 cuando no se envía archivo', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(false), routeParams)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/archivo/i)
  })

  it('16. 400 cuando el tipo de archivo no está permitido', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente'))
    const { POST } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await POST(await makePostRequest(true, 'video/mp4'), routeParams)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/tipo de archivo/i)
  })
})

// ─── Tests: DELETE ────────────────────────────────────────────────────────────

describe('DELETE /api/pedidos/[id]/comprobante-pago', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUuidParam.mockReturnValue(null)
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })
  })

  it('17. 401 sin sesión', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { DELETE } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await DELETE(makeDeleteRequest(), routeParams)
    expect(res.status).toBe(401)
  })

  it('18. 403 para vendedor', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    const { DELETE } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await DELETE(makeDeleteRequest(), routeParams)
    expect(res.status).toBe(403)
  })

  it('19. 400 para agent con pedido en confirmado', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado', 'comprobantes-pago/x.png'))
    const { DELETE } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await DELETE(makeDeleteRequest(), routeParams)
    expect(res.status).toBe(400)
  })

  it('20. 200 para agent con pedido en pendiente', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('pendiente', 'comprobantes-pago/x.png'))
    const { DELETE } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await DELETE(makeDeleteRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)
    expect(mockDbUpdate).toHaveBeenCalled()
  })

  it('21. 200 para admin con pedido en confirmado (bypass estado)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado', 'comprobantes-pago/x.png'))
    const { DELETE } = await import('@/app/api/pedidos/[id]/comprobante-pago/route')
    const res = await DELETE(makeDeleteRequest(), routeParams)
    expect(res.status).toBe(200)
    expect(mockDbUpdate).toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks (must come before vi.mock calls) ───────────────────────────

const {
  mockAuth,
  mockGetSessionContext,
  mockRequireAdmin,
  mockCreateMeta,
  mockGetMetaByVendedorPeriodo,
  mockIsMesBloqueable,
  mockUpdateMetaFutura,
  mockUpdateMetaVigente,
  mockGetMetaWithVendedor,
  mockDuplicarMetasMesAnterior,
  mockCalcularAvanceVendedor,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockCreateMeta: vi.fn(),
  mockGetMetaByVendedorPeriodo: vi.fn(),
  mockIsMesBloqueable: vi.fn(),
  mockUpdateMetaFutura: vi.fn(),
  mockUpdateMetaVigente: vi.fn(),
  mockGetMetaWithVendedor: vi.fn(),
  mockDuplicarMetasMesAnterior: vi.fn(),
  mockCalcularAvanceVendedor: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/territorios/context', () => ({ getSessionContext: mockGetSessionContext }))
vi.mock('@/lib/metas/metas.service', () => ({
  createMeta: mockCreateMeta,
  getMetaByVendedorPeriodo: mockGetMetaByVendedorPeriodo,
  isMesBloqueable: mockIsMesBloqueable,
  updateMetaFutura: mockUpdateMetaFutura,
  updateMetaVigente: mockUpdateMetaVigente,
  getMetaWithVendedor: mockGetMetaWithVendedor,
  duplicarMetasMesAnterior: mockDuplicarMetasMesAnterior,
}))
vi.mock('@/lib/metas/avance.service', () => ({
  calcularAvanceVendedor: mockCalcularAvanceVendedor,
  calcularAvanceTodos: vi.fn().mockResolvedValue([]),
}))

// db mock — only the GET handlers use db directly; POST/PUT delegate to service
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    query: {
      territorioAgente: { findMany: vi.fn().mockResolvedValue([]) },
      territorioGerente: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}))

vi.mock('@/db/schema', () => ({
  metas: {
    id: 'metas.id',
    vendedorId: 'metas.vendedorId',
    periodoAnio: 'metas.periodoAnio',
    periodoMes: 'metas.periodoMes',
  },
  users: { id: 'users.id', name: 'users.name' },
  territorioAgente: {
    territorioId: 'territorioAgente.territorioId',
    agenteId: 'territorioAgente.agenteId',
  },
  territorioGerente: {
    gerenteId: 'territorioGerente.gerenteId',
    territorioId: 'territorioGerente.territorioId',
  },
}))

// Import route handlers after all mocks are registered
import { POST as postMetas } from '@/app/api/metas/route'
import { PUT as putMeta, PATCH as patchMeta } from '@/app/api/metas/[id]/route'
import { POST as postCorregir } from '@/app/api/metas/[id]/corregir/route'
import { POST as postDuplicar } from '@/app/api/metas/duplicar/route'
import { GET as getAvance } from '@/app/api/metas/avance/route'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Use canonical UUIDs throughout — createMetaSchema requires z.string().uuid()
const ADMIN_ID = '00000000-0000-0000-0000-000000000001'
const VENDEDOR_ID = '00000000-0000-0000-0000-000000000002'
const META_ID = '00000000-0000-0000-0000-000000000003'

const ADMIN_SESSION = {
  user: { id: ADMIN_ID, email: 'admin@test.com', name: 'Admin', role: 'admin' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const ADMIN_CTX = {
  userId: ADMIN_ID,
  role: 'admin' as const,
  agentesVisibles: [],
  territoriosGestionados: [],
}

const AGENT_SESSION = {
  user: { id: VENDEDOR_ID, email: 'agent@test.com', name: 'Agent', role: 'agent' as const, avatarColor: '#000' },
  expires: '2099-01-01',
}

const AGENT_CTX = {
  userId: VENDEDOR_ID,
  role: 'agent' as const,
  agentesVisibles: [],
  territoriosGestionados: [],
}

function makeFakeMeta(overrides: Record<string, unknown> = {}) {
  return {
    id: META_ID,
    vendedorId: VENDEDOR_ID,
    periodoAnio: 2027,
    periodoMes: 3,
    clientesNuevosObjetivo: 5,
    pedidosObjetivo: 20,
    montoCobradoObjetivo: '100000.00',
    conversionLeadsObjetivo: '30.00',
    pctClientesConPedidoObjetivo: '75.00',
    creadoPor: ADMIN_ID,
    fechaCreacion: new Date('2026-05-01'),
    fechaActualizacion: new Date('2026-05-01'),
    ...overrides,
  }
}

// ─── Request helpers ──────────────────────────────────────────────────────────

function makePost(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePut(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGet(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`)
}

// Route context helper for dynamic segments
function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ─── (a) POST /api/metas — pctClientesConPedidoObjetivo=75 → 201, persiste '75' ─

describe('(a) POST /api/metas — campo pctClientesConPedidoObjetivo persiste', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockGetSessionContext.mockResolvedValue(ADMIN_CTX)
    mockRequireAdmin.mockReturnValue(undefined) // admin — no throw
    mockIsMesBloqueable.mockReturnValue('futuro')
    mockGetMetaByVendedorPeriodo.mockResolvedValue(null) // no existing meta
  })

  it('responde 201 y el servicio recibe pctClientesConPedidoObjetivo="75"', async () => {
    const createdMeta = makeFakeMeta({ pctClientesConPedidoObjetivo: '75' })
    mockCreateMeta.mockResolvedValue(createdMeta)

    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      clientesNuevosObjetivo: 5,
      pedidosObjetivo: 20,
      montoCobradoObjetivo: '100000.00',
      conversionLeadsObjetivo: '30.00',
      pctClientesConPedidoObjetivo: '75',
    })

    const response = await postMetas(req)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.data.pctClientesConPedidoObjetivo).toBe('75')

    // Verify the service was called with the validated field
    const serviceArg = mockCreateMeta.mock.calls[0]?.[0] as Record<string, unknown>
    expect(serviceArg.pctClientesConPedidoObjetivo).toBe('75')
  })
})

// ─── (b) POST /api/metas — pctClientesConPedidoObjetivo=150 → 400 (fuera de rango) ─

describe('(b) POST /api/metas — pctClientesConPedidoObjetivo=150 rechazado con 400', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockGetSessionContext.mockResolvedValue(ADMIN_CTX)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  it('responde 400 cuando pctClientesConPedidoObjetivo excede 100', async () => {
    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      clientesNuevosObjetivo: 5,
      pedidosObjetivo: 20,
      montoCobradoObjetivo: '100000.00',
      conversionLeadsObjetivo: '30.00',
      pctClientesConPedidoObjetivo: '150',
    })

    const response = await postMetas(req)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
    // createMeta should never be called when validation fails
    expect(mockCreateMeta).not.toHaveBeenCalled()
  })
})

// ─── (c) POST /api/metas — sin el campo → 201, default '0' ─────────────────

describe('(c) POST /api/metas — sin pctClientesConPedidoObjetivo → default "0"', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockGetSessionContext.mockResolvedValue(ADMIN_CTX)
    mockRequireAdmin.mockReturnValue(undefined)
    mockIsMesBloqueable.mockReturnValue('futuro')
    mockGetMetaByVendedorPeriodo.mockResolvedValue(null)
  })

  it('responde 201 y el servicio recibe pctClientesConPedidoObjetivo="0" (default del schema)', async () => {
    const createdMeta = makeFakeMeta({ pctClientesConPedidoObjetivo: '0' })
    mockCreateMeta.mockResolvedValue(createdMeta)

    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      clientesNuevosObjetivo: 5,
      pedidosObjetivo: 20,
      montoCobradoObjetivo: '100000.00',
      conversionLeadsObjetivo: '30.00',
      // pctClientesConPedidoObjetivo deliberately omitted
    })

    const response = await postMetas(req)
    expect(response.status).toBe(201)

    // Zod .default('0') kicks in when the field is absent
    const serviceArg = mockCreateMeta.mock.calls[0]?.[0] as Record<string, unknown>
    expect(serviceArg.pctClientesConPedidoObjetivo).toBe('0')
  })
})

// ─── (d) PATCH /api/metas/[id] — actualizar solo el nuevo campo → 200 + diff correcto ─

describe('(d) PATCH /api/metas/[id] — pctClientesConPedidoObjetivo → 200, diff en audit log', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('PATCH responde 200 y updateMetaFutura recibe pctClientesConPedidoObjetivo="85.00"', async () => {
    const existingMeta = makeFakeMeta({
      periodoAnio: 2027,
      periodoMes: 3,
      pctClientesConPedidoObjetivo: '70.00',
      vendedorNombre: 'Vendedor Test',
    })
    const updatedMeta = { ...existingMeta, pctClientesConPedidoObjetivo: '85.00' }

    mockGetMetaWithVendedor.mockResolvedValue(existingMeta)
    mockIsMesBloqueable.mockReturnValue('futuro')
    mockUpdateMetaFutura.mockResolvedValue(updatedMeta)

    const req = new NextRequest(`http://localhost/api/metas/${META_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pctClientesConPedidoObjetivo: '85.00' }),
    })

    const response = await patchMeta(req, routeCtx(META_ID))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.pctClientesConPedidoObjetivo).toBe('85.00')

    // Service receives the field — audit log diff (oldValues='70.00' → newValues='85.00')
    // is created inside updateMetaFutura (verified in service unit tests)
    const [, inputArg] = mockUpdateMetaFutura.mock.calls[0] as [string, Record<string, unknown>, string]
    expect(inputArg.pctClientesConPedidoObjetivo).toBe('85.00')
  })

  it('PATCH con pctClientesConPedidoObjetivo="-5" → 400 (fuera de rango)', async () => {
    mockGetMetaWithVendedor.mockResolvedValue(makeFakeMeta())
    mockIsMesBloqueable.mockReturnValue('futuro')

    const req = new NextRequest(`http://localhost/api/metas/${META_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pctClientesConPedidoObjetivo: '-5' }),
    })

    const response = await patchMeta(req, routeCtx(META_ID))
    expect(response.status).toBe(400)
    expect(mockUpdateMetaFutura).not.toHaveBeenCalled()
  })
})

// ─── (e) POST /api/metas/duplicar — destino hereda pctClientesConPedidoObjetivo del origen ─

describe('(e) POST /api/metas/duplicar — copia pctClientesConPedidoObjetivo al destino', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
    // Target period must be 'futuro' — 2027-03 is future relative to 2026-05-10
    mockIsMesBloqueable.mockReturnValue('futuro')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('responde 200 y llama duplicarMetasMesAnterior con el período destino correcto', async () => {
    mockDuplicarMetasMesAnterior.mockResolvedValue({ created: 2 })

    const req = makePost('/api/metas/duplicar', {
      anioObjetivo: 2027,
      mesObjetivo: 3,
    })

    const response = await postDuplicar(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.created).toBe(2)

    // Service is called with the target period and adminId
    const [anio, mes] = mockDuplicarMetasMesAnterior.mock.calls[0] as [number, number, string]
    expect(anio).toBe(2027)
    expect(mes).toBe(3)
    // The copying of pctClientesConPedidoObjetivo is fully tested in
    // tests/metas/metas.service.test.ts (e) and (f)
  })
})

// ─── (f) GET /api/metas/avance — vendedor sin clientes → pctClientesConPedido.estado="na" ─

describe('(f) GET /api/metas/avance — vendedor sin clientes → estado "na"', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(AGENT_SESSION)
    mockGetSessionContext.mockResolvedValue(AGENT_CTX)
  })

  it('responde 200 con pctClientesConPedido.estado="na" cuando el denominador es cero', async () => {
    const avanceConNa = {
      meta: makeFakeMeta(),
      clientesNuevos: { alcanzado: 0, pct: 0, proyeccion: 0, estado: 'en_curso' },
      pedidos: { alcanzado: 0, pct: 0, proyeccion: 0, estado: 'en_curso' },
      montoCobrado: { alcanzado: 0, pct: 0, proyeccion: 0, estado: 'en_curso' },
      conversionLeads: { alcanzado: 0, pct: 0, proyeccion: 0, estado: 'en_curso' },
      // null denominator → 'na'
      pctClientesConPedido: {
        alcanzado: null,
        pct: null,
        proyeccion: null,
        estado: 'na',
      },
    }

    mockCalcularAvanceVendedor.mockResolvedValue(avanceConNa)

    const req = makeGet('/api/metas/avance?anio=2027&mes=3')
    const response = await getAvance(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.pctClientesConPedido.estado).toBe('na')
    expect(body.data.pctClientesConPedido.alcanzado).toBeNull()
    expect(body.data.pctClientesConPedido.pct).toBeNull()

    // Verify the response shape includes the new field at all
    expect(body.data).toHaveProperty('pctClientesConPedido')
  })

  it('responde 200 con pctClientesConPedido incluido cuando hay clientes asignados', async () => {
    const avanceConDatos = {
      meta: makeFakeMeta(),
      clientesNuevos: { alcanzado: 3, pct: 60, proyeccion: 5, estado: 'en_curso' },
      pedidos: { alcanzado: 12, pct: 60, proyeccion: 20, estado: 'en_curso' },
      montoCobrado: { alcanzado: 60000, pct: 60, proyeccion: 100000, estado: 'en_curso' },
      conversionLeads: { alcanzado: 25, pct: 83, proyeccion: 30, estado: 'en_curso' },
      pctClientesConPedido: {
        alcanzado: 62.5,
        pct: 78,
        proyeccion: 75,
        estado: 'en_curso',
      },
    }

    mockCalcularAvanceVendedor.mockResolvedValue(avanceConDatos)

    const req = makeGet('/api/metas/avance?anio=2027&mes=3')
    const response = await getAvance(req)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.pctClientesConPedido.alcanzado).toBe(62.5)
    expect(body.data.pctClientesConPedido.estado).toBe('en_curso')
  })
})

// ─── (task 4) POST /api/metas/[id]/corregir — audit log diff includes pctClientesConPedidoObjetivo ─

describe('(task 4) POST /api/metas/[id]/corregir — diff de pctClientesConPedidoObjetivo en audit log', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('llama updateMetaVigente con pctClientesConPedidoObjetivo y el motivo correctos → 200', async () => {
    const existingMeta = makeFakeMeta({
      periodoAnio: 2026,
      periodoMes: 5, // current period → 'vigente'
      pctClientesConPedidoObjetivo: '70.00',
      vendedorNombre: 'Vendedor Test',
    })
    const updatedMeta = { ...existingMeta, pctClientesConPedidoObjetivo: '85.00' }

    mockGetMetaWithVendedor.mockResolvedValue(existingMeta)
    mockIsMesBloqueable.mockReturnValue('vigente') // corregir path requires vigente
    mockUpdateMetaVigente.mockResolvedValue(updatedMeta)

    const req = makePost(`/api/metas/${META_ID}/corregir`, {
      pctClientesConPedidoObjetivo: '85.00',
      motivo: 'Ajuste de cobertura de cartera para el período vigente',
    })

    const response = await postCorregir(req, routeCtx(META_ID))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.pctClientesConPedidoObjetivo).toBe('85.00')

    // updateMetaVigente(id, updateFields, motivo, adminId)
    const [idArg, updateFields, motivoArg] = mockUpdateMetaVigente.mock.calls[0] as
      [string, Record<string, unknown>, string, string]

    expect(idArg).toBe(META_ID)
    expect(updateFields.pctClientesConPedidoObjetivo).toBe('85.00')
    expect(motivoArg).toBe('Ajuste de cobertura de cartera para el período vigente')
    // oldValues/newValues diff (old='70.00' → new='85.00') is created inside
    // updateMetaVigente and verified in metas.service.test.ts (d)
  })

  it('corregir con pctClientesConPedidoObjetivo=200 → 400 (fuera de rango)', async () => {
    mockGetMetaWithVendedor.mockResolvedValue(makeFakeMeta({ periodoAnio: 2026, periodoMes: 5 }))
    mockIsMesBloqueable.mockReturnValue('vigente')

    const req = makePost(`/api/metas/${META_ID}/corregir`, {
      pctClientesConPedidoObjetivo: '200',
      motivo: 'Motivo de corrección válido',
    })

    const response = await postCorregir(req, routeCtx(META_ID))
    expect(response.status).toBe(400)
    expect(mockUpdateMetaVigente).not.toHaveBeenCalled()
  })
})

// ─── (pctCobranza-1) POST /api/metas — pctCobranzaObjetivo persiste en el servicio ──

describe('(pctCobranza-1) POST /api/metas — pctCobranzaObjetivo persiste (agente y vendedor)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockGetSessionContext.mockResolvedValue(ADMIN_CTX)
    mockRequireAdmin.mockReturnValue(undefined)
    mockIsMesBloqueable.mockReturnValue('futuro')
    mockGetMetaByVendedorPeriodo.mockResolvedValue(null)
  })

  it('POST 201: createMeta recibe pctCobranzaObjetivo="75.00"', async () => {
    const createdMeta = makeFakeMeta({ pctCobranzaObjetivo: '75.00' } as Record<string, unknown>)
    mockCreateMeta.mockResolvedValue(createdMeta)

    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      clientesNuevosObjetivo: 5,
      pedidosObjetivo: 20,
      montoCobradoObjetivo: '100000.00',
      conversionLeadsObjetivo: '30.00',
      pctClientesConPedidoObjetivo: '75',
      pctPedidosPagadosObjetivo: '10',
      pctCobranzaObjetivo: '75.00',
    })

    const response = await postMetas(req)
    expect(response.status).toBe(201)

    const serviceArg = mockCreateMeta.mock.calls[0]?.[0] as Record<string, unknown>
    expect(serviceArg.pctCobranzaObjetivo).toBe('75.00')
  })

  it('POST 201: sin pctCobranzaObjetivo → default "0" por schema', async () => {
    const createdMeta = makeFakeMeta({ pctCobranzaObjetivo: '0' } as Record<string, unknown>)
    mockCreateMeta.mockResolvedValue(createdMeta)

    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      clientesNuevosObjetivo: 5,
      pedidosObjetivo: 20,
      montoCobradoObjetivo: '100000.00',
      conversionLeadsObjetivo: '30.00',
      // pctCobranzaObjetivo omitido → default '0'
    })

    const response = await postMetas(req)
    expect(response.status).toBe(201)

    const serviceArg = mockCreateMeta.mock.calls[0]?.[0] as Record<string, unknown>
    expect(serviceArg.pctCobranzaObjetivo).toBe('0')
  })

  it('POST 400: pctCobranzaObjetivo=150 rechazado por validación (fuera de rango)', async () => {
    const req = makePost('/api/metas', {
      vendedorId: VENDEDOR_ID,
      periodoAnio: 2027,
      periodoMes: 3,
      pctCobranzaObjetivo: '150',
    })

    const response = await postMetas(req)
    expect(response.status).toBe(400)
    expect(mockCreateMeta).not.toHaveBeenCalled()
  })
})

// ─── (pctCobranza-2) PATCH /api/metas/[id] — pctCobranzaObjetivo actualizado ──

describe('(pctCobranza-2) PATCH /api/metas/[id] — pctCobranzaObjetivo persiste (PUT y PATCH)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    mockRequireAdmin.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('PATCH 200: updateMetaFutura recibe pctCobranzaObjetivo="80.00"', async () => {
    const existingMeta = makeFakeMeta({
      periodoAnio: 2027, periodoMes: 3,
      pctCobranzaObjetivo: '50.00',
      vendedorNombre: 'Vendedor Test',
    } as Record<string, unknown>)
    const updatedMeta = { ...existingMeta, pctCobranzaObjetivo: '80.00' }

    mockGetMetaWithVendedor.mockResolvedValue(existingMeta)
    mockIsMesBloqueable.mockReturnValue('futuro')
    mockUpdateMetaFutura.mockResolvedValue(updatedMeta)

    const req = new NextRequest(`http://localhost/api/metas/${META_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pctCobranzaObjetivo: '80.00' }),
    })

    const response = await patchMeta(req, routeCtx(META_ID))
    expect(response.status).toBe(200)

    const [, inputArg] = mockUpdateMetaFutura.mock.calls[0] as [string, Record<string, unknown>, string]
    expect(inputArg.pctCobranzaObjetivo).toBe('80.00')
  })

  it('PATCH 400: pctCobranzaObjetivo="-5" rechazado (fuera de rango)', async () => {
    mockGetMetaWithVendedor.mockResolvedValue(makeFakeMeta())
    mockIsMesBloqueable.mockReturnValue('futuro')

    const req = new NextRequest(`http://localhost/api/metas/${META_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pctCobranzaObjetivo: '-5' }),
    })

    const response = await patchMeta(req, routeCtx(META_ID))
    expect(response.status).toBe(400)
    expect(mockUpdateMetaFutura).not.toHaveBeenCalled()
  })
})

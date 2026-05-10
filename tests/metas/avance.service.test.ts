import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
//
// avance.service uses two DB access patterns:
//   1. db.query.metas.findFirst   — Drizzle relational query
//   2. db.select(...).from(...).where(...)  — Drizzle query builder
//
// For pattern 2 we use a chainable mock factory: each call to db.select()
// returns an object whose .from() returns an object whose .where() returns
// a Promise.  We capture the terminal resolver so each test can control the
// final result.

const { mockMetasFindFirst, mockSelect } = vi.hoisted(() => {
  return {
    mockMetasFindFirst: vi.fn(),
    mockSelect: vi.fn(),
  }
})

vi.mock('@/db', () => ({
  db: {
    query: {
      metas: { findFirst: mockMetasFindFirst },
    },
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  clientes: {
    id: 'clientes.id',
    vendedorConversionId: 'clientes.vendedorConversionId',
    fechaConversionANuevo: 'clientes.fechaConversionANuevo',
    asignadoA: 'clientes.asignadoA',
    deletedAt: 'clientes.deletedAt',
    $inferSelect: {},
  },
  pedidos: {
    id: 'pedidos.id',
    vendedorId: 'pedidos.vendedorId',
    estado: 'pedidos.estado',
    fecha: 'pedidos.fecha',
    deletedAt: 'pedidos.deletedAt',
    $inferSelect: {},
  },
  movimientosCC: {
    id: 'movimientosCC.id',
    clienteId: 'movimientosCC.clienteId',
    tipo: 'movimientosCC.tipo',
    monto: 'movimientosCC.monto',
    fecha: 'movimientosCC.fecha',
    deletedAt: 'movimientosCC.deletedAt',
    $inferSelect: {},
  },
  leads: {
    id: 'leads.id',
    assignedTo: 'leads.assignedTo',
    wonAt: 'leads.wonAt',
    deletedAt: 'leads.deletedAt',
    $inferSelect: {},
  },
  metas: {
    id: 'metas.id',
    vendedorId: 'metas.vendedorId',
    periodoAnio: 'metas.periodoAnio',
    periodoMes: 'metas.periodoMes',
    $inferSelect: {},
  },
}))

import { calcularAvanceMeta } from '@/lib/metas/avance.service'

// ─── Chainable select mock helpers ───────────────────────────────────────────
//
// makeSelectResult(value) produces a chainable stub:
//   db.select(cols).from(table).where(cond)  → resolves to `value`

function makeSelectResult(resolvedValue: unknown) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  return { fromFn, whereFn, stub: { from: fromFn } }
}

// ─── Fake meta row used across tests ─────────────────────────────────────────

function makeMeta(overrides: Partial<{
  id: string
  vendedorId: string
  periodoAnio: number
  periodoMes: number
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  montoCobradoObjetivo: string
  conversionLeadsObjetivo: string
  creadoPor: string
  fechaCreacion: Date
  fechaActualizacion: Date
}> = {}) {
  return {
    id: 'meta-1',
    vendedorId: 'vendedor-1',
    periodoAnio: 2026,
    periodoMes: 5,
    clientesNuevosObjetivo: 5,
    pedidosObjetivo: 10,
    montoCobradoObjetivo: '50000.00',
    conversionLeadsObjetivo: '25.00',
    creadoPor: 'admin-1',
    fechaCreacion: new Date('2026-05-01'),
    fechaActualizacion: new Date('2026-05-01'),
    ...overrides,
  }
}

// ─── Select call ordering ─────────────────────────────────────────────────────
//
// calcularAvanceMeta delegates to 4 sub-functions via Promise.all. All four
// start concurrently, so their *first* synchronous db.select() calls fire in
// declaration order before any await resolves:
//
//   Call 0: clientesNuevosDelPeriodo   → count()
//   Call 1: pedidosConfirmadosDelPeriodo → count()
//   Call 2: montoCobradoDelPeriodo (a) → select clientes IDs
//   Call 3: conversionLeadsDelPeriodo ganados → count()   (inner Promise.all)
//   Call 4: conversionLeadsDelPeriodo gestionados → count() (inner Promise.all)
//
// After the clientes-IDs query (call 2) resolves, the second part fires:
//   Call 5: montoCobradoDelPeriodo (b) → select sum(monto)
//
// We build all stubs upfront and feed them via mockSelect in this order.

interface SelectStubs {
  clientesNuevos: ReturnType<typeof makeSelectResult>
  pedidosCount: ReturnType<typeof makeSelectResult>
  montoClienteIds: ReturnType<typeof makeSelectResult>
  leadsGanados: ReturnType<typeof makeSelectResult>
  leadsGestionados: ReturnType<typeof makeSelectResult>
  montoSum: ReturnType<typeof makeSelectResult>
}

function setupSelectStubs(stubs: SelectStubs) {
  mockSelect
    .mockReturnValueOnce(stubs.clientesNuevos.stub)
    .mockReturnValueOnce(stubs.pedidosCount.stub)
    .mockReturnValueOnce(stubs.montoClienteIds.stub)
    .mockReturnValueOnce(stubs.leadsGanados.stub)
    .mockReturnValueOnce(stubs.leadsGestionados.stub)
    .mockReturnValueOnce(stubs.montoSum.stub)
}

function defaultStubs(overrides: Partial<{
  clientesNuevosTotal: number
  pedidosTotal: number
  clienteIds: Array<{ id: string }>
  montoTotal: string | null
  leadsGanados: number
  leadsGestionados: number
}> = {}): SelectStubs {
  const o = {
    clientesNuevosTotal: 0,
    pedidosTotal: 0,
    clienteIds: [{ id: 'cliente-1' }],
    montoTotal: null,
    leadsGanados: 0,
    leadsGestionados: 0,
    ...overrides,
  }
  return {
    clientesNuevos: makeSelectResult([{ total: o.clientesNuevosTotal }]),
    pedidosCount: makeSelectResult([{ total: o.pedidosTotal }]),
    montoClienteIds: makeSelectResult(o.clienteIds),
    leadsGanados: makeSelectResult([{ total: o.leadsGanados }]),
    leadsGestionados: makeSelectResult([{ total: o.leadsGestionados }]),
    montoSum: makeSelectResult([{ total: o.montoTotal }]),
  }
}

// ─── Tests: calcularEstadoMeta (via calcularAvanceMeta) ───────────────────────

describe('calcularEstadoMeta — estado logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('estado "cumplida" cuando alcanzado >= objetivo (pedidos: 10/10)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ pedidosObjetivo: 10 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 10 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.estado).toBe('cumplida')

    vi.useRealTimers()
  })

  it('estado "cumplida" cuando alcanzado supera el objetivo (pedidos: 12/10)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ pedidosObjetivo: 10 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 12 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.estado).toBe('cumplida')

    vi.useRealTimers()
  })

  it('estado "en_curso" cuando estamos en el período actual y por debajo del objetivo', async () => {
    vi.useFakeTimers()
    // Período actual = mayo 2026
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ periodoAnio: 2026, periodoMes: 5, pedidosObjetivo: 10 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 4 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.estado).toBe('en_curso')

    vi.useRealTimers()
  })

  it('estado "no_cumplida" cuando el período ya pasó y no se llegó al objetivo', async () => {
    vi.useFakeTimers()
    // Hoy es mayo 2026 pero la meta es de marzo 2026
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ periodoAnio: 2026, periodoMes: 3, pedidosObjetivo: 10 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 4 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.estado).toBe('no_cumplida')

    vi.useRealTimers()
  })

  // ── pct calculation ────────────────────────────────────────────────────────

  it('calcula pct=60 cuando alcanzado=3 y objetivo=5', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ clientesNuevosObjetivo: 5 }))
    setupSelectStubs(defaultStubs({ clientesNuevosTotal: 3 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.clientesNuevos.pct).toBe(60)

    vi.useRealTimers()
  })

  it('calcula pct=100 cuando objetivo=0 (evitar división por cero)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ clientesNuevosObjetivo: 0 }))
    setupSelectStubs(defaultStubs({ clientesNuevosTotal: 0 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.clientesNuevos.pct).toBe(100)

    vi.useRealTimers()
  })

  // ── proyeccion calculation ─────────────────────────────────────────────────

  it('proyeccion lineal: día 15 de un mes de 31 días, alcanzado=5 → proyeccion=10', async () => {
    vi.useFakeTimers()
    // Mayo 2026, día 15 (mayo tiene 31 días)
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ periodoAnio: 2026, periodoMes: 5, pedidosObjetivo: 20 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 5 }))

    const result = await calcularAvanceMeta('meta-1')

    // round(5/15 * 31) = round(10.333...) = 10
    expect(result.pedidos.proyeccion).toBe(10)

    vi.useRealTimers()
  })

  it('proyeccion = alcanzado para períodos pasados (no se proyecta)', async () => {
    vi.useFakeTimers()
    // Hoy es mayo 2026; la meta es de marzo 2026 (pasado)
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))

    mockMetasFindFirst.mockResolvedValue(makeMeta({ periodoAnio: 2026, periodoMes: 3, pedidosObjetivo: 20 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 7 }))

    const result = await calcularAvanceMeta('meta-1')

    // Not current period → proyeccion stays at alcanzado
    expect(result.pedidos.proyeccion).toBe(7)

    vi.useRealTimers()
  })
})

// ─── Tests: clientesNuevosDelPeriodo (via calcularAvanceMeta) ─────────────────

describe('clientesNuevosDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cuenta clientes con vendedorConversionId del vendedor y fecha dentro del período', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta())
    setupSelectStubs(defaultStubs({ clientesNuevosTotal: 3 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.clientesNuevos.alcanzado).toBe(3)
  })

  it('retorna 0 cuando no hay clientes nuevos en el período', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta())
    setupSelectStubs(defaultStubs({ clientesNuevosTotal: 0 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.clientesNuevos.alcanzado).toBe(0)
  })
})

// ─── Tests: pedidosConfirmadosDelPeriodo (via calcularAvanceMeta) ─────────────

describe('pedidosConfirmadosDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cuenta solo pedidos con estado=confirmado en el rango del período', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ pedidosObjetivo: 10 }))
    setupSelectStubs(defaultStubs({ pedidosTotal: 6 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.alcanzado).toBe(6)
  })

  it('retorna 0 cuando no hay pedidos confirmados en el período', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta())
    setupSelectStubs(defaultStubs({ pedidosTotal: 0 }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.pedidos.alcanzado).toBe(0)
  })
})

// ─── Tests: montoCobradoDelPeriodo (via calcularAvanceMeta) ───────────────────

describe('montoCobradoDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('suma solo movimientos de tipo=credito para clientes del vendedor', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ montoCobradoObjetivo: '50000.00' }))
    setupSelectStubs(defaultStubs({
      clienteIds: [{ id: 'cliente-1' }, { id: 'cliente-2' }],
      montoTotal: '35000.00',
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.montoCobrado.alcanzado).toBe(35000)
  })

  it('retorna 0 cuando el vendedor no tiene clientes asignados', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta())

    // clienteIds query returns empty list → service returns 0 without querying movimientos
    const clientesNuevosStub = makeSelectResult([{ total: 0 }])
    const pedidosStub = makeSelectResult([{ total: 0 }])
    const montoClienteIdsStub = makeSelectResult([])  // no clients
    // montoSum stub is never reached — but we still need stubs for leads
    const leadsGanadosStub = makeSelectResult([{ total: 0 }])
    const leadsGestionadosStub = makeSelectResult([{ total: 0 }])

    mockSelect
      .mockReturnValueOnce(clientesNuevosStub.stub)
      .mockReturnValueOnce(pedidosStub.stub)
      .mockReturnValueOnce(montoClienteIdsStub.stub)
      // No montoSum call when clienteIds is empty
      .mockReturnValueOnce(leadsGanadosStub.stub)
      .mockReturnValueOnce(leadsGestionadosStub.stub)

    const result = await calcularAvanceMeta('meta-1')

    expect(result.montoCobrado.alcanzado).toBe(0)
  })

  it('retorna 0 cuando la suma devuelve null (sin movimientos)', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta())
    setupSelectStubs(defaultStubs({
      clienteIds: [{ id: 'cliente-1' }],
      montoTotal: null,
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.montoCobrado.alcanzado).toBe(0)
  })
})

// ─── Tests: conversionLeadsDelPeriodo (via calcularAvanceMeta) ────────────────

describe('conversionLeadsDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna 0 cuando gestionados=0 para evitar división por cero', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ conversionLeadsObjetivo: '25.00' }))
    setupSelectStubs(defaultStubs({
      leadsGanados: 0,
      leadsGestionados: 0,
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.conversionLeads.alcanzado).toBe(0)
  })

  it('calcula porcentaje correcto: 2 ganados / 8 gestionados = 25.00', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ conversionLeadsObjetivo: '50.00' }))
    setupSelectStubs(defaultStubs({
      leadsGanados: 2,
      leadsGestionados: 8,
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.conversionLeads.alcanzado).toBe(25)
  })

  it('calcula porcentaje correcto: 3 ganados / 4 gestionados = 75.00', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ conversionLeadsObjetivo: '50.00' }))
    setupSelectStubs(defaultStubs({
      leadsGanados: 3,
      leadsGestionados: 4,
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.conversionLeads.alcanzado).toBe(75)
  })

  it('retorna 100 cuando todos los leads gestionados fueron ganados', async () => {
    mockMetasFindFirst.mockResolvedValue(makeMeta({ conversionLeadsObjetivo: '80.00' }))
    setupSelectStubs(defaultStubs({
      leadsGanados: 5,
      leadsGestionados: 5,
    }))

    const result = await calcularAvanceMeta('meta-1')

    expect(result.conversionLeads.alcanzado).toBe(100)
  })
})

// ─── Tests: calcularAvanceMeta — meta not found ───────────────────────────────

describe('calcularAvanceMeta — meta no encontrada', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lanza un error cuando la meta no existe', async () => {
    mockMetasFindFirst.mockResolvedValue(undefined)

    await expect(calcularAvanceMeta('meta-inexistente')).rejects.toThrow('meta-inexistente')
  })
})

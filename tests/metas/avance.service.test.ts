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
    clienteId: 'pedidos.clienteId',
    vendedorId: 'pedidos.vendedorId',
    estado: 'pedidos.estado',
    estadoPago: 'pedidos.estadoPago',
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

import { calcularAvanceMeta, pctClientesConPedidoDelPeriodo, pctPedidosPagadosDelPeriodo } from '@/lib/metas/avance.service'

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
  pctClientesConPedidoObjetivo: string
  pctPedidosPagadosObjetivo: string
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
    pctClientesConPedidoObjetivo: '80.00',
    pctPedidosPagadosObjetivo: '0.00',
    creadoPor: 'admin-1',
    fechaCreacion: new Date('2026-05-01'),
    fechaActualizacion: new Date('2026-05-01'),
    ...overrides,
  }
}

// ─── Select call ordering ─────────────────────────────────────────────────────
//
// calcularAvanceMeta delegates to 6 sub-functions via Promise.all. All six
// start concurrently, so their *first* synchronous db.select() calls fire in
// declaration order before any await resolves:
//
//   Call 0: clientesNuevosDelPeriodo   → count()
//   Call 1: pedidosConfirmadosDelPeriodo → count()
//   Call 2: montoCobradoDelPeriodo (a) → select clientes IDs
//   Call 3: conversionLeadsDelPeriodo ganados → count()   (inner Promise.all)
//   Call 4: conversionLeadsDelPeriodo gestionados → count() (inner Promise.all)
//   Call 5: pctClientesConPedidoDelPeriodo (a) → select clientes IDs
//   Call 6: pctPedidosPagadosDelPeriodo (a) → denominador count (inner Promise.all)
//   Call 7: pctPedidosPagadosDelPeriodo (b) → numerador count (inner Promise.all)
//
// After the clientes-IDs queries (calls 2 and 5) resolve, the second parts fire:
//   Call 8: montoCobradoDelPeriodo (b) → select sum(monto)  (after #2 resolves)
//   Call 9: pctClientesConPedidoDelPeriodo (b) → select pedidos (after #5 resolves)
//
// We build all stubs upfront and feed them via mockSelect in this order.

interface SelectStubs {
  clientesNuevos: ReturnType<typeof makeSelectResult>
  pedidosCount: ReturnType<typeof makeSelectResult>
  montoClienteIds: ReturnType<typeof makeSelectResult>
  leadsGanados: ReturnType<typeof makeSelectResult>
  leadsGestionados: ReturnType<typeof makeSelectResult>
  pctClienteIds: ReturnType<typeof makeSelectResult>
  pctPedidosPagadosDen: ReturnType<typeof makeSelectResult>
  pctPedidosPagadosNum: ReturnType<typeof makeSelectResult>
  montoSum: ReturnType<typeof makeSelectResult>
  pctPedidos: ReturnType<typeof makeSelectResult>
}

function setupSelectStubs(stubs: SelectStubs) {
  mockSelect
    .mockReturnValueOnce(stubs.clientesNuevos.stub)        // #0
    .mockReturnValueOnce(stubs.pedidosCount.stub)           // #1
    .mockReturnValueOnce(stubs.montoClienteIds.stub)        // #2
    .mockReturnValueOnce(stubs.leadsGanados.stub)           // #3
    .mockReturnValueOnce(stubs.leadsGestionados.stub)       // #4
    .mockReturnValueOnce(stubs.pctClienteIds.stub)          // #5
    .mockReturnValueOnce(stubs.pctPedidosPagadosDen.stub)   // #6
    .mockReturnValueOnce(stubs.pctPedidosPagadosNum.stub)   // #7
    .mockReturnValueOnce(stubs.montoSum.stub)               // #8
    .mockReturnValueOnce(stubs.pctPedidos.stub)             // #9
}

function defaultStubs(overrides: Partial<{
  clientesNuevosTotal: number
  pedidosTotal: number
  clienteIds: Array<{ id: string }>
  montoTotal: string | null
  leadsGanados: number
  leadsGestionados: number
  pctClienteIds: Array<{ id: string }>
  pctPedidoClienteIds: Array<{ clienteId: string }>
  pctPedidosPagadosDen: number
  pctPedidosPagadosNum: number
}> = {}): SelectStubs {
  const o = {
    clientesNuevosTotal: 0,
    pedidosTotal: 0,
    clienteIds: [{ id: 'cliente-1' }],
    montoTotal: null,
    leadsGanados: 0,
    leadsGestionados: 0,
    pctClienteIds: [],
    pctPedidoClienteIds: [],
    pctPedidosPagadosDen: 0,
    pctPedidosPagadosNum: 0,
    ...overrides,
  }
  return {
    clientesNuevos: makeSelectResult([{ total: o.clientesNuevosTotal }]),
    pedidosCount: makeSelectResult([{ total: o.pedidosTotal }]),
    montoClienteIds: makeSelectResult(o.clienteIds),
    leadsGanados: makeSelectResult([{ total: o.leadsGanados }]),
    leadsGestionados: makeSelectResult([{ total: o.leadsGestionados }]),
    pctClienteIds: makeSelectResult(o.pctClienteIds),
    pctPedidosPagadosDen: makeSelectResult([{ total: o.pctPedidosPagadosDen }]),
    pctPedidosPagadosNum: makeSelectResult([{ total: o.pctPedidosPagadosNum }]),
    montoSum: makeSelectResult([{ total: o.montoTotal }]),
    pctPedidos: makeSelectResult(o.pctPedidoClienteIds),
  }
}

// ─── Tests: calcularEstadoMeta (via calcularAvanceMeta) ───────────────────────

describe('calcularEstadoMeta — estado logic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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
    vi.resetAllMocks()
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
    vi.resetAllMocks()
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
    vi.resetAllMocks()
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
    const leadsGanadosStub = makeSelectResult([{ total: 0 }])
    const leadsGestionadosStub = makeSelectResult([{ total: 0 }])
    const pctClienteIdsStub = makeSelectResult([])  // no clients → pct returns null

    mockSelect
      .mockReturnValueOnce(clientesNuevosStub.stub)                          // #0
      .mockReturnValueOnce(pedidosStub.stub)                                  // #1
      .mockReturnValueOnce(montoClienteIdsStub.stub)                         // #2 (returns [])
      .mockReturnValueOnce(leadsGanadosStub.stub)                             // #3
      .mockReturnValueOnce(leadsGestionadosStub.stub)                        // #4
      .mockReturnValueOnce(pctClienteIdsStub.stub)                           // #5 (returns [])
      .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)            // #6 pctPedidosPagados den
      .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)            // #7 pctPedidosPagados num
      // No montoSum call (#8) when clienteIds is empty
      // No pctPedidos call (#9) when pctClienteIds is empty

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
    vi.resetAllMocks()
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
    vi.resetAllMocks()
  })

  it('lanza un error cuando la meta no existe', async () => {
    mockMetasFindFirst.mockResolvedValue(undefined)

    await expect(calcularAvanceMeta('meta-inexistente')).rejects.toThrow('meta-inexistente')
  })
})

// ─── Tests: pctClientesConPedidoDelPeriodo ────────────────────────────────────
//
// Tested directly (function is exported). Each test sets up mockSelect with
// 1 or 2 stubs depending on whether the denominator is zero.

describe('pctClientesConPedidoDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a. vendedor con 0 clientes asignados → null', async () => {
    // clientes query returns []
    mockSelect.mockReturnValueOnce(makeSelectResult([]).stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBeNull()
  })

  it('b. 5 clientes asignados, 3 con pedido confirmado en el mes → 60', async () => {
    const clienteStub = makeSelectResult([
      { id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' },
    ])
    const pedidoStub = makeSelectResult([
      { clienteId: 'c1' },
      { clienteId: 'c2' },
      { clienteId: 'c3' },
    ])
    mockSelect
      .mockReturnValueOnce(clienteStub.stub)
      .mockReturnValueOnce(pedidoStub.stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(60)
  })

  it('c. pedido con estado="cancelado" NO cuenta (query filtra por confirmado)', async () => {
    // La lógica de filtro ocurre en la DB; el mock simula que la query
    // ya devuelve vacío porque los cancelados fueron filtrados
    const clienteStub = makeSelectResult([{ id: 'c1' }])
    const pedidoStub = makeSelectResult([]) // ningún pedido confirmado
    mockSelect
      .mockReturnValueOnce(clienteStub.stub)
      .mockReturnValueOnce(pedidoStub.stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(0)
  })

  it('d. pedido confirmado de mes anterior NO cuenta (query filtra por fecha)', async () => {
    // El filtro fecha [start, end) excluye pedidos del mes anterior
    const clienteStub = makeSelectResult([{ id: 'c1' }])
    const pedidoStub = makeSelectResult([]) // ningún pedido en el mes actual
    mockSelect
      .mockReturnValueOnce(clienteStub.stub)
      .mockReturnValueOnce(pedidoStub.stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(0)
  })

  it('e. cliente con deletedAt NO cuenta en el denominador → si todos borrados retorna null', async () => {
    // isNull(clientes.deletedAt) excluye a los borrados.
    // La query devuelve vacío porque el único cliente tiene deletedAt.
    mockSelect.mockReturnValueOnce(makeSelectResult([]).stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBeNull()
  })

  it('f. 1 cliente con 3 pedidos confirmados cuenta como 1, no como 3', async () => {
    const clienteStub = makeSelectResult([{ id: 'c1' }])
    // 3 filas con el mismo clienteId → Set.size = 1
    const pedidoStub = makeSelectResult([
      { clienteId: 'c1' },
      { clienteId: 'c1' },
      { clienteId: 'c1' },
    ])
    mockSelect
      .mockReturnValueOnce(clienteStub.stub)
      .mockReturnValueOnce(pedidoStub.stub)

    const result = await pctClientesConPedidoDelPeriodo('vendedor-1', 2026, 5)

    // 1 cliente con pedido / 1 cliente total = 100%
    expect(result).toBe(100)
  })
})

// ─── Tests: pctPedidosPagadosDelPeriodo ──────────────────────────────────────

describe('pctPedidosPagadosDelPeriodo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a. sin pedidos confirmados en el período → null', async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)  // denominador
      .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)  // numerador

    const result = await pctPedidosPagadosDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBeNull()
  })

  it('b. 4 pedidos confirmados, 1 pagado → 25.0', async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectResult([{ total: 4 }]).stub)  // denominador
      .mockReturnValueOnce(makeSelectResult([{ total: 1 }]).stub)  // numerador

    const result = await pctPedidosPagadosDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(25)
  })

  it('c. 4 pedidos confirmados, 0 pagados → 0', async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectResult([{ total: 4 }]).stub)  // denominador
      .mockReturnValueOnce(makeSelectResult([{ total: 0 }]).stub)  // numerador

    const result = await pctPedidosPagadosDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(0)
  })

  it('d. todos los pedidos confirmados están pagados → 100', async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectResult([{ total: 5 }]).stub)  // denominador
      .mockReturnValueOnce(makeSelectResult([{ total: 5 }]).stub)  // numerador

    const result = await pctPedidosPagadosDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(100)
  })

  it('e. redondea a 2 decimales: 1 de 3 → 33.33', async () => {
    mockSelect
      .mockReturnValueOnce(makeSelectResult([{ total: 3 }]).stub)  // denominador
      .mockReturnValueOnce(makeSelectResult([{ total: 1 }]).stub)  // numerador

    const result = await pctPedidosPagadosDelPeriodo('vendedor-1', 2026, 5)

    expect(result).toBe(33.33)
  })
})

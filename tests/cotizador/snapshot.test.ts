import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSelect, mockFindMany } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFindMany: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: mockSelect, query: { recetas: { findMany: mockFindMany } } },
}))

import { armarSnapshotCotizador } from '@/lib/cotizador/snapshot'

function chain(result: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'limit', 'orderBy']) c[m] = () => c
  c['then'] = (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

const CONDICIONES = '1. PAGO. Al contado.\n\n2. ENTREGA. En planta ALIPRO.'

const CONFIG_ROW = {
  id: 1,
  margenPct: '35.00',
  cargoSetupPersonalizado: '150000.00',
  alfajoresPorCaja: 12,
  validezDias: 10,
  topeDescuentoPct: '8.00',
  condicionesComerciales: CONDICIONES,
  updatedBy: null,
  updatedAt: new Date(),
}

const INSUMOS = [
  { id: 'i-bob', nombre: 'Bobina', tipo: 'bobina', unidad: 'unidad', precio: '35.00', activo: true },
  { id: 'i-caja', nombre: 'Caja', tipo: 'caja', unidad: 'unidad', precio: '550.00', activo: true },
  { id: 'i-gall', nombre: 'Galletita', tipo: 'galletita', unidad: 'kg', precio: '6000.00', activo: true },
]

// Orden de consultas en armarSnapshotCotizador: config → insumos → recetas → escalones
function mockDb(config: unknown[], insumos: unknown[]) {
  mockSelect
    .mockReturnValueOnce(chain(config))
    .mockReturnValueOnce(chain(insumos))
    .mockReturnValueOnce(chain([]))
  mockFindMany.mockResolvedValue([
    { id: 'r1', gramaje: 60, activo: true, items: [{ recetaId: 'r1', insumoId: 'i-gall', gramos: '60.00' }] },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('armarSnapshotCotizador', () => {
  it('devuelve condicionesComerciales con el valor guardado en cotizador_config', async () => {
    mockDb([CONFIG_ROW], INSUMOS)

    const snap = await armarSnapshotCotizador()

    expect(snap.condicionesComerciales).toBe(CONDICIONES)
    expect(snap.validezDias).toBe(10)
    expect(snap.margenPct).toBe(35)
    expect(snap.topeDescuentoPct).toBe(8)
    // Los snapshots nuevos nacen con la fórmula de margen sobre venta
    expect(snap.formulaVersion).toBe(2)
  })

  it('sin fila de config cae a los defaults (condiciones null, validez 7)', async () => {
    mockDb([], INSUMOS)

    const snap = await armarSnapshotCotizador()

    expect(snap.condicionesComerciales).toBeNull()
    expect(snap.validezDias).toBe(7)
  })
})

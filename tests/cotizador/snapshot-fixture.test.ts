import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Garantía de FASE 1A (schema de costos): los cambios de schema NO alteran el
 * snapshot del cotizador. El fixture fue capturado ANTES de modificar
 * db/schema.ts; si armarSnapshotCotizador() cambia de forma o de valores,
 * este test falla. No regenerar el fixture salvo cambio de fórmula deliberado.
 */

const { mockSelect, mockFindMany } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFindMany: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: mockSelect, query: { recetas: { findMany: mockFindMany } } },
}))

import { armarSnapshotCotizador } from '@/lib/cotizador/snapshot'

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'cotizador-snapshot.fixture.json',
)

function chain(result: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'limit', 'orderBy']) c[m] = () => c
  c['then'] = (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

// Dataset representativo de producción: config guardada, insumos por kg y por
// unidad, dos recetas con items (una con un componente de insumo inactivo que
// no participa del costo) y escalones con último tramo abierto.
const CONFIG_ROW = {
  id: 1,
  margenPct: '35.00',
  cargoSetupPersonalizado: '150000.00',
  alfajoresPorCaja: 12,
  validezDias: 10,
  topeDescuentoPct: '8.00',
  condicionesComerciales: '1. PAGO. Al contado.\n\n2. ENTREGA. En planta ALIPRO.',
  condicionesPackagingPersonalizado: 'Packaging personalizado. Bobina del cliente.',
  updatedBy: null,
  updatedAt: new Date('2026-08-01T12:00:00Z'),
}

const INSUMOS = [
  { id: 'i-bob', nombre: 'Bobina', tipo: 'bobina', unidad: 'unidad', precio: '35.00', activo: true },
  { id: 'i-caja', nombre: 'Caja', tipo: 'caja', unidad: 'unidad', precio: '550.00', activo: true },
  { id: 'i-gall', nombre: 'Galletita', tipo: 'galletita', unidad: 'kg', precio: '6000.00', activo: true },
  { id: 'i-ddl', nombre: 'Dulce de leche', tipo: 'dulce_de_leche', unidad: 'kg', precio: '4800.50', activo: true },
  { id: 'i-choc', nombre: 'Chocolate', tipo: 'chocolate', unidad: 'kg', precio: '12000.00', activo: true },
]

const RECETAS = [
  {
    id: 'r-60',
    gramaje: 60,
    activo: true,
    items: [
      { recetaId: 'r-60', insumoId: 'i-gall', gramos: '38.50' },
      { recetaId: 'r-60', insumoId: 'i-ddl', gramos: '15.25' },
      { recetaId: 'r-60', insumoId: 'i-choc', gramos: '6.25' },
    ],
  },
  {
    id: 'r-80',
    gramaje: 80,
    activo: true,
    items: [
      { recetaId: 'r-80', insumoId: 'i-gall', gramos: '50.00' },
      { recetaId: 'r-80', insumoId: 'i-ddl', gramos: '20.00' },
      { recetaId: 'r-80', insumoId: 'i-choc', gramos: '10.00' },
      // Insumo que no está entre los activos por kg: no participa del costo
      { recetaId: 'r-80', insumoId: 'i-inactivo', gramos: '5.00' },
    ],
  },
]

const ESCALONES = [
  { id: 'e1', cantidadMin: 100, cantidadMax: 999, descuentoPct: '0.00', orden: 1 },
  { id: 'e2', cantidadMin: 1000, cantidadMax: 4999, descuentoPct: '5.00', orden: 2 },
  { id: 'e3', cantidadMin: 5000, cantidadMax: 9999, descuentoPct: '10.00', orden: 3 },
  { id: 'e4', cantidadMin: 10000, cantidadMax: null, descuentoPct: '15.00', orden: 4 },
]

beforeEach(() => {
  vi.clearAllMocks()
  // Orden de consultas en armarSnapshotCotizador: config → insumos → escalones
  mockSelect
    .mockReturnValueOnce(chain([CONFIG_ROW]))
    .mockReturnValueOnce(chain(INSUMOS))
    .mockReturnValueOnce(chain(ESCALONES))
  mockFindMany.mockResolvedValue(RECETAS)
})

describe('armarSnapshotCotizador — fixture pre-FASE 1A', () => {
  it('devuelve un JSON idénticamente igual al capturado antes del cambio de schema', async () => {
    const snap = await armarSnapshotCotizador()
    const actual = JSON.parse(JSON.stringify(snap))

    if (!existsSync(FIXTURE_PATH)) {
      // Primera ejecución (pre-cambio): captura el fixture.
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
      writeFileSync(FIXTURE_PATH, JSON.stringify(actual, null, 2) + '\n')
    }

    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    expect(actual).toEqual(fixture)
  })
})

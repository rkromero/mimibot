import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * No-regresión FASE 1B: armarSnapshotCotizador() + calcularCotizacion()
 * producen exactamente el mismo resultado que antes de introducir lib/costos
 * y el filtro esCotizador en snapshot.ts. El fixture fue capturado ANTES del
 * cambio; no regenerarlo salvo cambio de fórmula deliberado.
 */

const { mockSelect, mockFindMany } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFindMany: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: { select: mockSelect, query: { recetas: { findMany: mockFindMany } } },
}))

import { armarSnapshotCotizador } from '@/lib/cotizador/snapshot'
import { calcularCotizacion, type CotizacionInput } from '@/lib/cotizador/calculo'

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'no-regresion-fase1b.fixture.json',
)

function chain(result: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'limit', 'orderBy']) c[m] = () => c
  c['then'] = (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

const CONFIG_ROW = {
  id: 1,
  margenPct: '35.00',
  cargoSetupPersonalizado: '150000.00',
  alfajoresPorCaja: 12,
  validezDias: 10,
  topeDescuentoPct: '8.00',
  condicionesComerciales: '1. PAGO. Al contado.',
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

// Filas de recetas con la forma post-FASE 1A: las columnas nuevas (nombre,
// esCotizador, packaging, margen) no deben afectar el snapshot.
const RECETAS = [
  {
    id: 'r-60',
    nombre: 'Alfajor 60g',
    gramaje: 60,
    clienteId: null,
    esCotizador: true,
    bobinaInsumoId: null,
    cajaInsumoId: null,
    alfajoresPorCaja: null,
    margenPct: null,
    activo: true,
    items: [
      { recetaId: 'r-60', insumoId: 'i-gall', gramos: '27.00', cantidad: '27.0000' },
      { recetaId: 'r-60', insumoId: 'i-ddl', gramos: '21.00', cantidad: '21.0000' },
      { recetaId: 'r-60', insumoId: 'i-choc', gramos: '12.00', cantidad: '12.0000' },
    ],
  },
  {
    id: 'r-80',
    nombre: 'Alfajor 80g',
    gramaje: 80,
    clienteId: null,
    esCotizador: true,
    bobinaInsumoId: null,
    cajaInsumoId: null,
    alfajoresPorCaja: null,
    margenPct: null,
    activo: true,
    items: [
      { recetaId: 'r-80', insumoId: 'i-gall', gramos: '36.00', cantidad: '36.0000' },
      { recetaId: 'r-80', insumoId: 'i-ddl', gramos: '28.00', cantidad: '28.0000' },
      { recetaId: 'r-80', insumoId: 'i-choc', gramos: '16.00', cantidad: '16.0000' },
    ],
  },
]

const ESCALONES = [
  { id: 'e1', cantidadMin: 100, cantidadMax: 999, descuentoPct: '0.00', orden: 1 },
  { id: 'e2', cantidadMin: 1000, cantidadMax: 4999, descuentoPct: '5.00', orden: 2 },
  { id: 'e3', cantidadMin: 5000, cantidadMax: 9999, descuentoPct: '10.00', orden: 3 },
  { id: 'e4', cantidadMin: 10000, cantidadMax: null, descuentoPct: '15.00', orden: 4 },
]

const CASOS: CotizacionInput[] = [
  { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 },
  { cantidad: 5000, gramaje: 80, packaging: 'personalizado', descuentoManualPct: 5 },
  { cantidad: 500, gramaje: 60, packaging: 'personalizado', descuentoManualPct: 8 },
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

describe('no-regresión FASE 1B — snapshot + cotización', () => {
  it('los 3 casos producen el mismo desglose que antes de 1B', async () => {
    const snap = await armarSnapshotCotizador()
    const resultados = CASOS.map((caso) => calcularCotizacion(caso, snap))
    const actual = JSON.parse(JSON.stringify({ snapshot: snap, resultados }))

    if (!existsSync(FIXTURE_PATH)) {
      // Primera ejecución (pre-cambio): captura el fixture.
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
      writeFileSync(FIXTURE_PATH, JSON.stringify(actual, null, 2) + '\n')
    }

    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    expect(actual).toEqual(fixture)
  })
})

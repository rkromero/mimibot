import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictError } from '@/lib/errors'

const { mockFindFirst, mockSelect } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockSelect: vi.fn(),
}))

// El mock de db SOLO expone propuestas.findFirst y select (empresa_config).
// Si el servicio intentara leer cotizador_config, insumos, recetas o escalones
// vigentes, explotaría acá — la garantía de "solo desde el snapshot" se
// verifica por construcción.
vi.mock('@/db', () => ({
  db: {
    query: { propuestas: { findFirst: mockFindFirst } },
    select: mockSelect,
  },
}))

import { generarPropuestaPdf } from '@/lib/pdf/propuesta.service'

function selectChain(result: unknown[]) {
  return {
    from: () => ({ where: () => ({ limit: () => Promise.resolve(result) }) }),
  }
}

const PROPUESTA_BASE = {
  id: 'prop-1',
  numero: 42,
  leadId: 'lead-1',
  cantidad: 1000,
  gramaje: 60,
  packaging: 'cristal' as const,
  descuentoManualPct: '0.00',
  snapshot: { validezDias: 7, condicionesComerciales: 'Congeladas.' },
  resultado: {
    escenarios: [
      { cantidad: 1000, precioUnitNeto: 999.99, neto: 999_990, iva: 209_997.9, total: 1_209_987.9, setup: 0, elegido: true },
    ],
  },
  estado: 'aprobada' as const,
  vigenteHasta: '2026-08-26',
  creadoPor: 'user-1',
  aprobadoPor: null,
  createdAt: new Date('2026-08-19T14:00:00Z'),
  updatedAt: new Date('2026-08-19T14:00:00Z'),
  deletedAt: null,
  lead: {
    customFields: { empresa: 'Empresa Test SA' },
    contact: { name: 'Cliente Test', phone: '+549111111', email: 'c@test.com' },
  },
  creadoPorUser: undefined,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSelect.mockReturnValue(selectChain([]))
})

describe('generarPropuestaPdf', () => {
  it('pendiente_aprobacion → ConflictError (la ruta lo devuelve como 409)', async () => {
    mockFindFirst.mockResolvedValue({
      ...PROPUESTA_BASE,
      estado: 'pendiente_aprobacion',
      creadoPor: { name: 'Vendedor Test' },
    })

    await expect(generarPropuestaPdf('prop-1')).rejects.toBeInstanceOf(ConflictError)
    await expect(generarPropuestaPdf('prop-1')).rejects.toThrow('pendiente de aprobación')
    // Ni siquiera intenta leer empresa_config
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('genera el PDF desde la propuesta guardada sin tocar la config del cotizador', async () => {
    // drizzle expone la relación con el mismo nombre del campo: acá creadoPor
    // (relación) devuelve el usuario
    mockFindFirst.mockResolvedValue({
      ...PROPUESTA_BASE,
      creadoPor: { name: 'Vendedor Test' },
    })
    mockSelect.mockReturnValue(selectChain([{ nombre: 'ALIPRO SAS', cuit: '30-1', direccion: null, telefono: null, email: null }]))

    const result = await generarPropuestaPdf('prop-1')

    expect(result.filename).toBe('PROP-00042.pdf')
    expect(result.numero).toBe(42)
    expect(result.leadId).toBe('lead-1')
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    // Una sola consulta select: empresa_config (footer). Nada del cotizador.
    expect(mockSelect).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('snapshot viejo sin condicionesComerciales genera el PDF sin lanzar', async () => {
    mockFindFirst.mockResolvedValue({
      ...PROPUESTA_BASE,
      // Shape de las propuestas creadas antes del fix: sin condiciones
      snapshot: { validezDias: 7 },
      creadoPor: { name: 'Vendedor Test' },
    })

    const result = await generarPropuestaPdf('prop-1')
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)

  it('snapshot y resultado corruptos degradan a defaults sin lanzar', async () => {
    mockFindFirst.mockResolvedValue({
      ...PROPUESTA_BASE,
      snapshot: 'jsonb inesperado',
      resultado: 42,
      creadoPor: { name: 'Vendedor Test' },
    })

    const result = await generarPropuestaPdf('prop-1')
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})

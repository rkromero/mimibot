import { describe, it, expect } from 'vitest'
import { createRecetaSchema, updateRecetaSchema, duplicarRecetaSchema } from '@/lib/validations/cotizador'

const UUID_A = '5a1b2c3d-0000-4000-8000-000000000001'
const UUID_B = '5a1b2c3d-0000-4000-8000-000000000002'

const BASE = {
  nombre: 'Alfajor 60g',
  gramaje: 60,
  items: [
    { insumoId: UUID_A, cantidad: 38.5 },
    { insumoId: UUID_B, cantidad: 2 },
  ],
}

describe('createRecetaSchema', () => {
  it('acepta receta mixta y aplica defaults (esCotizador false, todo lo demás null)', () => {
    const r = createRecetaSchema.parse(BASE)
    expect(r.esCotizador).toBe(false)
    expect(r.clienteId).toBeNull()
    expect(r.bobinaInsumoId).toBeNull()
    expect(r.cajaInsumoId).toBeNull()
    expect(r.alfajoresPorCaja).toBeNull()
    expect(r.margenPct).toBeNull()
    expect(r.items).toHaveLength(2)
  })

  it('nombre vacío o solo espacios → rechazado', () => {
    expect(createRecetaSchema.safeParse({ ...BASE, nombre: '' }).success).toBe(false)
    expect(createRecetaSchema.safeParse({ ...BASE, nombre: '   ' }).success).toBe(false)
  })

  it('esCotizador true con clienteId → rechazado con mensaje claro', () => {
    const r = createRecetaSchema.safeParse({ ...BASE, esCotizador: true, clienteId: UUID_A })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Una receta del cotizador no puede pertenecer a un cliente')
    }
  })

  it('esCotizador true sin cliente → válido', () => {
    expect(createRecetaSchema.safeParse({ ...BASE, esCotizador: true }).success).toBe(true)
  })

  it('cantidad <= 0 en un item → rechazado', () => {
    const r = createRecetaSchema.safeParse({ ...BASE, items: [{ insumoId: UUID_A, cantidad: 0 }] })
    expect(r.success).toBe(false)
  })

  it('insumoId repetido → rechazado', () => {
    const r = createRecetaSchema.safeParse({
      ...BASE,
      items: [{ insumoId: UUID_A, cantidad: 10 }, { insumoId: UUID_A, cantidad: 5 }],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Hay insumos repetidos en la receta')
  })

  it('alfajoresPorCaja <= 0 → rechazado; null → válido', () => {
    expect(createRecetaSchema.safeParse({ ...BASE, alfajoresPorCaja: 0 }).success).toBe(false)
    expect(createRecetaSchema.safeParse({ ...BASE, alfajoresPorCaja: null }).success).toBe(true)
    expect(createRecetaSchema.safeParse({ ...BASE, alfajoresPorCaja: 12 }).success).toBe(true)
  })

  it('margenPct >= 100 → rechazado', () => {
    expect(createRecetaSchema.safeParse({ ...BASE, margenPct: 100 }).success).toBe(false)
    expect(createRecetaSchema.safeParse({ ...BASE, margenPct: 45.5 }).success).toBe(true)
  })
})

describe('updateRecetaSchema', () => {
  it('acepta PATCH parcial (solo items con cantidad)', () => {
    const r = updateRecetaSchema.safeParse({ items: [{ insumoId: UUID_A, cantidad: 27 }] })
    expect(r.success).toBe(true)
  })

  it('rechaza cantidad negativa', () => {
    expect(updateRecetaSchema.safeParse({ items: [{ insumoId: UUID_A, cantidad: -1 }] }).success).toBe(false)
  })
})

describe('duplicarRecetaSchema', () => {
  it('exige clienteId uuid y nombre no vacío', () => {
    expect(duplicarRecetaSchema.safeParse({ clienteId: UUID_A, nombre: 'Copia' }).success).toBe(true)
    expect(duplicarRecetaSchema.safeParse({ clienteId: 'no-uuid', nombre: 'Copia' }).success).toBe(false)
    expect(duplicarRecetaSchema.safeParse({ clienteId: UUID_A, nombre: ' ' }).success).toBe(false)
  })
})

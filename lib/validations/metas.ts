import { z } from 'zod'

// ─── Shared objective fields ──────────────────────────────────────────────────

const clientesNuevosObjetivoField = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .int('Debe ser un entero')
  .min(0, 'Debe ser mayor o igual a 0')

const pedidosObjetivoField = z
  .number({ invalid_type_error: 'Debe ser un número' })
  .int('Debe ser un entero')
  .min(0, 'Debe ser mayor o igual a 0')

const montoCobradoObjetivoField = z
  .string()
  .min(1, 'El monto es requerido')
  .refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    'Debe ser un número mayor o igual a 0',
  )

const conversionLeadsObjetivoField = z
  .string()
  .min(1, 'La conversión es requerida')
  .refine(
    (val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num >= 0 && num <= 100
    },
    'Debe ser un porcentaje entre 0 y 100',
  )

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const createMetaSchema = z.object({
  vendedorId: z.string().uuid('ID de vendedor inválido'),
  periodoAnio: z
    .number({ invalid_type_error: 'El año debe ser un número' })
    .int('El año debe ser un entero')
    .min(2020, 'El año mínimo es 2020')
    .max(2100, 'El año máximo es 2100'),
  periodoMes: z
    .number({ invalid_type_error: 'El mes debe ser un número' })
    .int('El mes debe ser un entero')
    .min(1, 'El mes mínimo es 1')
    .max(12, 'El mes máximo es 12'),
  clientesNuevosObjetivo: clientesNuevosObjetivoField.optional().default(0),
  pedidosObjetivo: pedidosObjetivoField.optional().default(0),
  montoCobradoObjetivo: montoCobradoObjetivoField.optional().default('0'),
  conversionLeadsObjetivo: conversionLeadsObjetivoField.optional().default('0'),
})

export const updateMetaSchema = z.object({
  clientesNuevosObjetivo: clientesNuevosObjetivoField.optional(),
  pedidosObjetivo: pedidosObjetivoField.optional(),
  montoCobradoObjetivo: montoCobradoObjetivoField.optional(),
  conversionLeadsObjetivo: conversionLeadsObjetivoField.optional(),
})

export const corregirMetaSchema = updateMetaSchema.extend({
  motivo: z
    .string()
    .min(10, 'El motivo debe tener al menos 10 caracteres'),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateMetaInput = z.infer<typeof createMetaSchema>
export type UpdateMetaInput = z.infer<typeof updateMetaSchema>
export type CorregirMetaInput = z.infer<typeof corregirMetaSchema>

import { z } from 'zod'

const precioSchema = z.number({ invalid_type_error: 'El precio debe ser un número' })
  .positive('El precio debe ser mayor a 0')
  .max(999_999_999, 'Precio demasiado grande')

const pctSchema = z.number({ invalid_type_error: 'El porcentaje debe ser un número' })
  .min(0, 'El porcentaje no puede ser negativo')
  .max(100, 'El porcentaje no puede superar 100')

export const createInsumoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100).transform((v) => v.trim()),
  tipo: z.enum(['galletita', 'dulce_de_leche', 'chocolate', 'bobina', 'caja', 'otro'], {
    errorMap: () => ({ message: 'Tipo inválido' }),
  }),
  unidad: z.enum(['kg', 'unidad'], {
    errorMap: () => ({ message: 'Unidad inválida' }),
  }),
  precio: precioSchema,
})

export const updateInsumoSchema = createInsumoSchema.partial().extend({
  activo: z.boolean().optional(),
})

const gramajeSchema = z.number({ invalid_type_error: 'El gramaje debe ser un número' })
  .int('El gramaje debe ser entero')
  .positive('El gramaje debe ser mayor a 0')
  .max(1000, 'Gramaje demasiado grande')

const recetaItemsSchema = z.array(z.object({
  insumoId: z.string().uuid('Insumo inválido'),
  gramos: z.number({ invalid_type_error: 'Los gramos deben ser un número' })
    .positive('Los gramos deben ser mayores a 0')
    .max(999_999, 'Gramos demasiado grandes'),
})).max(50, 'Demasiados componentes')

export const createRecetaSchema = z.object({
  gramaje: gramajeSchema,
  items: recetaItemsSchema.default([]),
})

export const updateRecetaSchema = z.object({
  gramaje: gramajeSchema.optional(),
  activo: z.boolean().optional(),
  items: recetaItemsSchema.optional(),
})

export const cotizadorConfigSchema = z.object({
  // Margen SOBRE VENTA: 100% implicaría precio = costo / 0 (división por cero)
  margenPct: z.number({ invalid_type_error: 'El margen debe ser un número' })
    .min(0, 'El margen no puede ser negativo')
    .lt(100, 'El margen sobre venta debe ser menor a 100% (100% divide por cero)'),
  cargoSetupPersonalizado: z.number({ invalid_type_error: 'El cargo debe ser un número' })
    .min(0, 'El cargo no puede ser negativo')
    .max(999_999_999, 'Cargo demasiado grande'),
  alfajoresPorCaja: z.number({ invalid_type_error: 'Alfajores por caja debe ser un número' })
    .int('Alfajores por caja debe ser entero')
    .positive('Alfajores por caja debe ser mayor a 0'),
  validezDias: z.number({ invalid_type_error: 'La validez debe ser un número' })
    .int('La validez debe ser entera')
    .positive('La validez debe ser mayor a 0')
    .max(365, 'Validez demasiado larga'),
  topeDescuentoPct: pctSchema,
  condicionesComerciales: z.string().max(4000, 'Condiciones demasiado largas')
    .optional().nullable()
    .transform((v) => (v === undefined ? undefined : (v?.trim() || null))),
})

export const escalonesSchema = z.object({
  escalones: z.array(z.object({
    cantidadMin: z.number({ invalid_type_error: 'La cantidad mínima debe ser un número' })
      .int('La cantidad mínima debe ser entera')
      .positive('La cantidad mínima debe ser mayor a 0'),
    cantidadMax: z.number()
      .int('La cantidad máxima debe ser entera')
      .positive('La cantidad máxima debe ser mayor a 0')
      .nullable(),
    descuentoPct: pctSchema,
  }).refine(
    (e) => e.cantidadMax === null || e.cantidadMax >= e.cantidadMin,
    { message: 'La cantidad máxima debe ser mayor o igual a la mínima' },
  )).max(20, 'Demasiados escalones'),
})

export const cotizacionInputSchema = z.object({
  cantidad: z.number({ invalid_type_error: 'La cantidad debe ser un número' })
    .int('La cantidad debe ser entera')
    .positive('La cantidad debe ser mayor a 0')
    .max(10_000_000, 'Cantidad demasiado grande'),
  gramaje: gramajeSchema,
  packaging: z.enum(['cristal', 'personalizado'], {
    errorMap: () => ({ message: 'Packaging inválido' }),
  }),
  descuentoManualPct: pctSchema.default(0),
})

export const updatePropuestaSchema = z.object({
  estado: z.enum(['aprobada', 'rechazada'], {
    errorMap: () => ({ message: 'Estado inválido' }),
  }),
})

// ── Lectura tipada de los jsonb congelados de una propuesta ──────────────────
// Validan solo lo que los consumidores necesitan (el snapshot guarda más
// campos y el objeto no es estricto). Los snapshots viejos sin
// condicionesComerciales validan igual y toman el default; ante un jsonb
// inesperado el caller usa defaults en vez de reventar.

export const propuestaSnapshotPdfSchema = z.object({
  validezDias: z.number().int().positive().default(7),
  condicionesComerciales: z.string().nullish().default(null).transform((v) => v ?? null),
})

const escenarioPropuestaSchema = z.object({
  cantidad: z.number(),
  precioUnitNeto: z.number(),
  neto: z.number(),
  iva: z.number(),
  total: z.number(),
  setup: z.number().default(0),
  elegido: z.boolean().default(false),
})

export const propuestaResultadoSchema = z.object({
  escenarios: z.array(escenarioPropuestaSchema).default([]),
})

export const PROPUESTA_SNAPSHOT_PDF_DEFAULTS: PropuestaSnapshotPdf = {
  validezDias: 7,
  condicionesComerciales: null,
}

export type PropuestaSnapshotPdf = z.infer<typeof propuestaSnapshotPdfSchema>
export type PropuestaResultado = z.infer<typeof propuestaResultadoSchema>

export type CreateInsumoInput = z.infer<typeof createInsumoSchema>
export type UpdateInsumoInput = z.infer<typeof updateInsumoSchema>
export type CotizadorConfigInput = z.infer<typeof cotizadorConfigSchema>
export type CotizacionInputParsed = z.infer<typeof cotizacionInputSchema>

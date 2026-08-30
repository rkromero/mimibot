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

// Los items llevan `cantidad` en la unidad del insumo: gramos para los de kg,
// unidades para los de 'unidad'
const recetaItemsSchema = z.array(z.object({
  insumoId: z.string().uuid('Insumo inválido'),
  cantidad: z.number({ invalid_type_error: 'La cantidad debe ser un número' })
    .positive('La cantidad debe ser mayor a 0')
    .max(999_999, 'Cantidad demasiado grande'),
})).max(50, 'Demasiados componentes')
  .refine(
    (items) => new Set(items.map((i) => i.insumoId)).size === items.length,
    { message: 'Hay insumos repetidos en la receta' },
  )

const nombreRecetaSchema = z.string().trim().min(1, 'El nombre es requerido').max(120, 'Nombre demasiado largo')
// Margen sobre venta propio de la receta (opcional: si falta hereda de la
// lista o del global, ver lib/costos/margen.ts)
const margenRecetaSchema = z.number({ invalid_type_error: 'El margen debe ser un número' })
  .min(0, 'El margen no puede ser negativo')
  .lt(100, 'El margen sobre venta debe ser menor a 100%')
const alfajoresPorCajaSchema = z.number({ invalid_type_error: 'Alfajores por caja debe ser un número' })
  .int('Alfajores por caja debe ser entero')
  .positive('Alfajores por caja debe ser mayor a 0')

export const createRecetaSchema = z.object({
  nombre: nombreRecetaSchema,
  gramaje: gramajeSchema,
  clienteId: z.string().uuid('Cliente inválido').nullish().default(null),
  esCotizador: z.boolean().optional().default(false),
  bobinaInsumoId: z.string().uuid('Bobina inválida').nullish().default(null),
  cajaInsumoId: z.string().uuid('Caja inválida').nullish().default(null),
  alfajoresPorCaja: alfajoresPorCajaSchema.nullish().default(null),
  margenPct: margenRecetaSchema.nullish().default(null),
  items: recetaItemsSchema.default([]),
}).refine((d) => !(d.esCotizador && d.clienteId != null), {
  message: 'Una receta del cotizador no puede pertenecer a un cliente',
  path: ['esCotizador'],
})

// El cruce esCotizador × clienteId de un PATCH parcial se valida en el
// service contra el estado EFECTIVO (payload + fila actual)
export const updateRecetaSchema = z.object({
  nombre: nombreRecetaSchema.optional(),
  gramaje: gramajeSchema.optional(),
  clienteId: z.string().uuid('Cliente inválido').nullable().optional(),
  esCotizador: z.boolean().optional(),
  bobinaInsumoId: z.string().uuid('Bobina inválida').nullable().optional(),
  cajaInsumoId: z.string().uuid('Caja inválida').nullable().optional(),
  alfajoresPorCaja: alfajoresPorCajaSchema.nullable().optional(),
  margenPct: margenRecetaSchema.nullable().optional(),
  activo: z.boolean().optional(),
  items: recetaItemsSchema.optional(),
})

export const duplicarRecetaSchema = z.object({
  clienteId: z.string().uuid('Cliente inválido'),
  nombre: nombreRecetaSchema,
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
  condicionesPackagingPersonalizado: z.string().max(4000, 'Condiciones demasiado largas')
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
  condicionesPackagingPersonalizado: z.string().nullish().default(null).transform((v) => v ?? null),
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
  condicionesPackagingPersonalizado: null,
}

export type PropuestaSnapshotPdf = z.infer<typeof propuestaSnapshotPdfSchema>
export type PropuestaResultado = z.infer<typeof propuestaResultadoSchema>

export type CreateInsumoInput = z.infer<typeof createInsumoSchema>
export type UpdateInsumoInput = z.infer<typeof updateInsumoSchema>
export type CotizadorConfigInput = z.infer<typeof cotizadorConfigSchema>
export type CotizacionInputParsed = z.infer<typeof cotizacionInputSchema>
export type CreateRecetaInput = z.infer<typeof createRecetaSchema>
export type UpdateRecetaInput = z.infer<typeof updateRecetaSchema>
export type DuplicarRecetaInput = z.infer<typeof duplicarRecetaSchema>

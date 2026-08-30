import { z } from 'zod'

const UNIDADES_VENTA = ['unidad', 'caja_12', 'caja_24', 'display'] as const

const margenPctProductoSchema = z
  .string()
  .refine((val) => {
    if (!val) return true
    const num = parseFloat(val)
    return !isNaN(num) && num >= 0 && num < 100
  }, 'El margen debe ser un número entre 0 y menos de 100')

export const createProductoSchema = z.object({
  // Enlace a receta (FASE 1D): con receta, el costo se calcula solo
  recetaId: z.string().uuid('Receta inválida').nullish().default(null),
  margenPct: margenPctProductoSchema.optional().nullable(),
  marcaId: z.string().uuid('La marca es requerida'),
  sku: z.string().min(1, 'El SKU es requerido').max(50).optional(),
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  descripcion: z.string().max(1000).optional().nullable(),
  precio: z
    .string()
    .min(1, 'El precio es requerido')
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, 'El precio debe ser un número mayor a 0'),
  costo: z
    .string()
    .refine((val) => {
      if (!val) return true
      const num = parseFloat(val)
      return !isNaN(num) && num >= 0
    }, 'El costo debe ser un número positivo')
    .optional()
    .nullable(),
  categoria: z.string().max(100).optional().nullable(),
  imagenUrl: z.string().url('URL de imagen inválida').optional().nullable(),
  unidadVenta: z.enum(UNIDADES_VENTA).optional(),
  pesoG: z.number().int().positive().optional().nullable(),
  ivaPct: z
    .string()
    .refine((val) => ['0', '0.00', '10.5', '10.50', '21', '21.00'].includes(val), 'IVA inválido')
    .optional(),
  stockMinimo: z.number().int().min(0).optional(),
}).refine((d) => !(d.recetaId != null && d.costo != null && d.costo !== ''), {
  message: 'El costo se calcula desde la receta: no se puede cargar a mano',
  path: ['costo'],
})

// El cruce costo-a-mano × recetaId de un PATCH parcial se valida en la ruta
// contra el estado EFECTIVO (payload + fila actual)
export const updateProductoSchema = z.object({
  recetaId: z.string().uuid('Receta inválida').nullable().optional(),
  margenPct: margenPctProductoSchema.optional().nullable(),
  marcaId: z.string().uuid('Marca inválida').optional(),
  sku: z.string().min(1).max(50).optional().nullable(),
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(1000).nullable().optional(),
  precio: z
    .string()
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, 'El precio debe ser un número mayor a 0')
    .optional(),
  costo: z.string().optional().nullable(),
  categoria: z.string().max(100).optional().nullable(),
  imagenUrl: z.string().optional().nullable(),
  unidadVenta: z.enum(UNIDADES_VENTA).optional(),
  pesoG: z.number().int().positive().optional().nullable(),
  ivaPct: z.string().optional().nullable(),
  stockMinimo: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
})

export type CreateProductoInput = z.infer<typeof createProductoSchema>
export type UpdateProductoInput = z.infer<typeof updateProductoSchema>

import { z } from 'zod'

export const createProductoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  descripcion: z.string().max(1000).optional().nullable(),
  precio: z
    .string()
    .min(1, 'El precio es requerido')
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, 'El precio debe ser un número mayor a 0'),
})

export const updateProductoSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(1000).nullable().optional(),
  precio: z
    .string()
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, 'El precio debe ser un número mayor a 0')
    .optional(),
  activo: z.boolean().optional(),
})

export type CreateProductoInput = z.infer<typeof createProductoSchema>
export type UpdateProductoInput = z.infer<typeof updateProductoSchema>

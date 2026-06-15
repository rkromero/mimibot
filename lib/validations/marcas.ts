import { z } from 'zod'

export const createMarcaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100),
})

export const updateMarcaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(100).optional(),
  activo: z.boolean().optional(),
})

export const asignarMarcasSchema = z.object({
  marcaIds: z.array(z.string().uuid('ID de marca inválido')).default([]),
})

export type CreateMarcaInput = z.infer<typeof createMarcaSchema>
export type UpdateMarcaInput = z.infer<typeof updateMarcaSchema>
export type AsignarMarcasInput = z.infer<typeof asignarMarcasSchema>

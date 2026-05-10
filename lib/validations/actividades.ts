import { z } from 'zod'

export const createActividadSchema = z.object({
  tipo: z.enum(['visita', 'llamada', 'email', 'nota', 'tarea']),
  titulo: z.string().min(1, 'El título es requerido').max(300),
  notas: z.string().max(2000).optional().nullable(),
  fechaProgramada: z.string().datetime({ offset: true }).optional().nullable(),
  asignadoA: z.string().uuid().optional().nullable(),
})

export const updateActividadSchema = z.object({
  estado: z.enum(['pendiente', 'completada', 'cancelada']).optional(),
  titulo: z.string().min(1).max(300).optional(),
  notas: z.string().max(2000).nullable().optional(),
  fechaProgramada: z.string().datetime({ offset: true }).nullable().optional(),
  asignadoA: z.string().uuid().nullable().optional(),
})

export type CreateActividadInput = z.infer<typeof createActividadSchema>
export type UpdateActividadInput = z.infer<typeof updateActividadSchema>

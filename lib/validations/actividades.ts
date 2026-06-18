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

export const registrarVisitaSchema = z
  .object({
    resultado: z.enum(['compro', 'no_compro', 'no_estaba', 'reprogramar']),
    notas: z.string().max(2000).optional().nullable(),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    precision: z.number().min(0).optional().nullable(),
    proximaVisita: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.resultado === 'reprogramar' && !data.proximaVisita) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proximaVisita'],
        message: 'La próxima visita es requerida cuando el resultado es reprogramar',
      })
    }
  })

export type CreateActividadInput = z.infer<typeof createActividadSchema>
export type UpdateActividadInput = z.infer<typeof updateActividadSchema>
export type RegistrarVisitaInput = z.infer<typeof registrarVisitaSchema>

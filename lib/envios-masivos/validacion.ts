import { z } from 'zod'

/** Filtros del grupo de leads de un envío masivo (mismos criterios que el pipeline). */
export const filtrosEnvioSchema = z.object({
  stageId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  source: z.enum(['whatsapp', 'landing', 'manual']).nullable().optional(),
  creadoDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  creadoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export type FiltrosEnvioInput = z.infer<typeof filtrosEnvioSchema>

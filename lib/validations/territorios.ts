import { z } from 'zod'

export const createTerritorioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  descripcion: z.string().max(1000).optional().nullable(),
})

export const updateTerritorioSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(1000).nullable().optional(),
})

export const asignarAgenteSchema = z.object({
  agenteId: z.string().uuid('ID de agente inválido'),
})

export const asignarGerenteSchema = z.object({
  gerenteId: z.string().uuid('ID de gerente inválido'),
})

export const reasignacionMasivaSchema = z.object({
  clienteIds: z.array(z.string().uuid()).min(1, 'Seleccioná al menos un cliente'),
  nuevoTerritorioId: z.string().uuid('ID de territorio inválido'),
})

export type CreateTerritorioInput = z.infer<typeof createTerritorioSchema>
export type UpdateTerritorioInput = z.infer<typeof updateTerritorioSchema>
export type ReasignacionMasivaInput = z.infer<typeof reasignacionMasivaSchema>

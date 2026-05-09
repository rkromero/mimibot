import { z } from 'zod'

export const createClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  apellido: z.string().min(1, 'El apellido es requerido').max(200),
  email: z.string().email('Email inválido').optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  cuit: z.string().max(20).optional().nullable(),
  // Only admin can set this field — enforce that check in the route handler
  asignadoA: z.string().uuid().optional().nullable(),
})

export const updateClienteSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  apellido: z.string().min(1).max(200).optional(),
  email: z.string().email('Email inválido').nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
  direccion: z.string().max(500).nullable().optional(),
  cuit: z.string().max(20).nullable().optional(),
  // Only admin can set this field — enforce that check in the route handler
  asignadoA: z.string().uuid().nullable().optional(),
})


export const clienteFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  asignadoA: z.string().uuid().optional(),
})

export type CreateClienteInput = z.infer<typeof createClienteSchema>
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>
export type ClienteFilters = z.infer<typeof clienteFiltersSchema>

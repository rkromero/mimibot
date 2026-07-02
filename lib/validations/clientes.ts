import { z } from 'zod'

// El CUIT es único global entre clientes activos (índice parcial en migración
// 0048 + chequeo app-level en POST/PATCH). Trim; vacío o solo espacios → null
// para que los "" no colisionen entre sí. undefined se preserva (PATCH: no tocar).
export function normalizeCuit(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const cuitSchema = z.string().max(20).optional().nullable().transform(normalizeCuit)

export const createClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  apellido: z.string().min(1, 'El apellido es requerido').max(200),
  email: z.string().email('Email inválido').optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  localidad: z.string().max(200).optional().nullable(),
  provincia: z.string().max(100).optional().nullable(),
  codigoPostal: z.string().max(10).optional().nullable(),
  cuit: cuitSchema,
  // Only admin can set this field — enforce that check in the route handler
  asignadoA: z.string().uuid().optional().nullable(),
  // Territory assignment — resolved by role in route handler
  territorioId: z.string().uuid().optional().nullable(),
})

// Schema for agents: telefono and codigoPostal are required and non-empty
export const createClienteAgentSchema = createClienteSchema.extend({
  telefono: z.string(
    { required_error: 'El teléfono es requerido para agentes' },
  ).min(1, 'El teléfono es requerido para agentes').max(30),
  codigoPostal: z.string(
    { required_error: 'El código postal es requerido para agentes' },
  ).min(1, 'El código postal es requerido para agentes').max(10),
})

export const updateClienteSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  apellido: z.string().min(1).max(200).optional(),
  email: z.string().email('Email inválido').nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
  direccion: z.string().max(500).nullable().optional(),
  localidad: z.string().max(200).nullable().optional(),
  provincia: z.string().max(100).nullable().optional(),
  codigoPostal: z.string().max(10).nullable().optional(),
  cuit: cuitSchema,
  // Only admin can set this field — enforce that check in the route handler
  asignadoA: z.string().uuid().nullable().optional(),
})


export const clienteFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  asignadoA: z.string().uuid().optional(),
  territorioId: z.string().uuid().optional(),
  estadoActividad: z.enum(['activo', 'inactivo', 'perdido']).optional(),
})

export type CreateClienteInput = z.infer<typeof createClienteSchema>
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>
export type ClienteFilters = z.infer<typeof clienteFiltersSchema>

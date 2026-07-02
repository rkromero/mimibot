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

// barrio: mismo tratamiento que cuit — trim, vacío → null, undefined se preserva
const barrioSchema = z.string().max(200).optional().nullable().transform(normalizeCuit)

export const LOCALIDAD_CABA = 'Ciudad Autónoma de Buenos Aires'

// Provincia CABA en cualquiera de sus variantes usuales (case-insensitive,
// con o sin tildes). Para clientes de CABA el barrio es obligatorio.
export function esProvinciaCABA(provincia: string | null | undefined): boolean {
  if (!provincia) return false
  const p = provincia.trim().toLowerCase()
  return (
    p === 'caba' ||
    p === 'ciudad autónoma de buenos aires' ||
    p === 'ciudad autonoma de buenos aires' ||
    p === 'capital federal'
  )
}

export const createClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200),
  apellido: z.string().min(1, 'El apellido es requerido').max(200),
  email: z.string().email('Email inválido').optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  localidad: z.string().max(200).optional().nullable(),
  provincia: z.string().max(100).optional().nullable(),
  codigoPostal: z.string().max(10).optional().nullable(),
  barrio: barrioSchema,
  cuit: cuitSchema,
  // Only admin can set this field — enforce that check in the route handler
  asignadoA: z.string().uuid().optional().nullable(),
  // Territory assignment — resolved by role in route handler
  territorioId: z.string().uuid().optional().nullable(),
})

// Schema for agents: telefono es requerido y no vacío. El código postal es
// opcional para todos los roles: no hay fuente pública confiable para
// autocompletarlo y frenaba el alta.
export const createClienteAgentSchema = createClienteSchema.extend({
  telefono: z.string(
    { required_error: 'El teléfono es requerido para agentes' },
  ).min(1, 'El teléfono es requerido para agentes').max(30),
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
  barrio: barrioSchema,
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

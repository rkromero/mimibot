import { z } from 'zod'

export const businessConfigSchema = z.object({
  clienteNuevoMinPedidos: z.number().int().min(1, 'Debe ser al menos 1'),
  clienteNuevoVentanaDias: z.number().int().min(1, 'Debe ser al menos 1'),
  clienteNuevoMontoMinimo: z.number().positive('Debe ser un valor positivo').optional().nullable(),
  clienteActivoDias: z.number().int().min(1, 'Debe ser al menos 1'),
  clienteInactivoDias: z.number().int().min(1, 'Debe ser al menos 1'),
  clientePerdidoDias: z.number().int().min(1, 'Debe ser al menos 1'),
  clienteMorosoDias: z.number().int().min(1, 'Debe ser al menos 1'),
})

export const updateBusinessConfigSchema = businessConfigSchema.partial()

export type BusinessConfigInput = z.infer<typeof businessConfigSchema>
export type UpdateBusinessConfigInput = z.infer<typeof updateBusinessConfigSchema>

import { z } from 'zod'

const pedidoItemSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  cantidad: z
    .number()
    .int('La cantidad debe ser un entero')
    .positive('La cantidad debe ser mayor a 0'),
})

export const createPedidoSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  fecha: z.string().optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
  items: z
    .array(pedidoItemSchema)
    .min(1, 'El pedido debe tener al menos un ítem'),
})

export const updatePedidoSchema = z.object({
  estado: z
    .enum(['pendiente', 'confirmado', 'entregado', 'cancelado'])
    .optional(),
  observaciones: z.string().max(2000).nullable().optional(),
})

export const registrarPagoSchema = z.object({
  monto: z
    .string()
    .min(1, 'El monto es requerido')
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, 'El monto debe ser un número mayor a 0'),
  fecha: z.string().optional().nullable(),
  descripcion: z.string().max(500).optional().nullable(),
})

export type CreatePedidoInput = z.infer<typeof createPedidoSchema>
export type UpdatePedidoInput = z.infer<typeof updatePedidoSchema>
export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>

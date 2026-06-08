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
  // Gerente cargando en nombre de un agente
  vendedorId: z.string().uuid().optional().nullable(),
  descuento: z.number().min(0).max(100).optional().default(0),
  // Método de entrega — solo aplica al rol Agente; ignorado para Vendedor
  metodoEntrega: z.enum(['retiro_fabrica', 'expreso']).optional().nullable(),
  expresoNombre: z.string().max(200).optional().nullable(),
  expresoDireccion: z.string().max(500).optional().nullable(),
})

export const updatePedidoSchema = z.object({
  estado: z
    .enum(['pendiente', 'pendiente_aprobacion', 'confirmado', 'en_reparto', 'entregado', 'cancelado'])
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

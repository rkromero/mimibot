import { z } from 'zod'

const textoOpcional = (max: number) =>
  z.string().max(max).optional().nullable()
    .transform((v) => (v === undefined ? undefined : (v?.trim() || null)))

export const createGastoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  categoriaId: z.string().uuid('Categoría inválida'),
  monto: z.number({ required_error: 'El monto es requerido', invalid_type_error: 'El monto debe ser un número' })
    .positive('El monto debe ser mayor a 0')
    .max(999_999_999, 'Monto demasiado grande'),
  descripcion: textoOpcional(500),
  proveedorId: z.string().uuid('Proveedor inválido').optional().nullable(),
  comprobante: textoOpcional(100),
  metodoPago: z.enum(['efectivo', 'transferencia', 'mercadopago']).optional().nullable(),
})

export const updateGastoSchema = createGastoSchema.partial()

export const createGastoCategoriaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100).transform((v) => v.trim()),
  tipo: z.enum(['costo_directo', 'gasto_operativo'], {
    errorMap: () => ({ message: 'Tipo inválido' }),
  }),
})

export const createProveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200).transform((v) => v.trim()),
  cuit: textoOpcional(20),
  telefono: textoOpcional(30),
  email: z.string().email('Email inválido').optional().nullable().or(z.literal('').transform(() => null)),
  direccion: textoOpcional(500),
  notas: textoOpcional(500),
})

export const updateProveedorSchema = createProveedorSchema.partial().extend({
  activo: z.boolean().optional(),
})

export type CreateGastoInput = z.infer<typeof createGastoSchema>
export type UpdateGastoInput = z.infer<typeof updateGastoSchema>

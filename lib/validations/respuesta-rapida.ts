import { z } from 'zod'

export const ATAJO_MAX = 30
export const TITULO_MAX = 80
export const BODY_MAX = 2000

/**
 * Normaliza el comando tal como lo escribe la persona ("/Hola Juan ") al
 * formato guardado ("hola-juan"): sin barra inicial, minúsculas, sin tildes y
 * con guiones en lugar de espacios. La validación de caracteres queda para el
 * schema.
 */
export function normalizarAtajo(input: string): string {
  return input
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '-')
}

const atajoSchema = z
  .string({ required_error: 'Indicá el comando' })
  .transform(normalizarAtajo)
  .pipe(
    z
      .string()
      .min(1, 'Indicá el comando (por ejemplo: /hola)')
      .max(ATAJO_MAX, `El comando no puede superar los ${ATAJO_MAX} caracteres`)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'El comando solo puede tener letras, números, guiones y guiones bajos'),
  )

const tituloSchema = z
  .string({ required_error: 'Indicá un título' })
  .trim()
  .min(1, 'Indicá un título')
  .max(TITULO_MAX, `El título no puede superar los ${TITULO_MAX} caracteres`)

const bodySchema = z
  .string({ required_error: 'Escribí el mensaje' })
  .trim()
  .min(1, 'Escribí el mensaje')
  .max(BODY_MAX, `El mensaje no puede superar los ${BODY_MAX} caracteres`)

export const respuestaRapidaSchema = z.object({
  atajo: atajoSchema,
  titulo: tituloSchema,
  body: bodySchema,
})

export const respuestaRapidaUpdateSchema = z
  .object({
    atajo: atajoSchema.optional(),
    titulo: tituloSchema.optional(),
    body: bodySchema.optional(),
  })
  .refine((d) => d.atajo !== undefined || d.titulo !== undefined || d.body !== undefined, {
    message: 'No hay nada para actualizar',
  })

export type RespuestaRapidaInput = z.infer<typeof respuestaRapidaSchema>
export type RespuestaRapidaUpdateInput = z.infer<typeof respuestaRapidaUpdateSchema>

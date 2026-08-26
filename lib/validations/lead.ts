import { CODIGOS_MOTIVO_PERDIDA } from '@/lib/leads/motivos-perdida'
import { z } from 'zod'

export const createLeadSchema = z.object({
  contactName: z.string().min(1).max(200),
  contactPhone: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  stageId: z.string().uuid(),
  source: z.enum(['whatsapp', 'landing', 'manual']).default('manual'),
  assignedTo: z.string().uuid().optional().nullable(),
  budget: z.string().optional().nullable(),
  productInterest: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  direccion: z.string().max(300).optional().nullable(),
  localidad: z.string().max(120).optional().nullable(),
  tags: z.array(z.string().uuid()).optional(),
})

export const updateLeadSchema = z.object({
  stageId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  budget: z.string().nullable().optional(),
  productInterest: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  direccion: z.string().max(300).nullable().optional(),
  localidad: z.string().max(120).nullable().optional(),
  botEnabled: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
  /** Al mover a Cerrado Perdido: por qué se pierde */
  motivoPerdida: z.enum(CODIGOS_MOTIVO_PERDIDA).optional(),
  motivoPerdidaDetalle: z.string().max(300).nullable().optional(),
})

// ─── Intake público (formularios de landings) ─────────────────────────────────
// Cada landing manda un payload distinto: la de ALIPRO usa claves en español
// (nombre/whatsapp/origen + campos de calificación), la de Compañía de
// Alfajores manda nombre/telefono/producto/volumen, y el shape original
// (name/phone/source) se sigue aceptando. El schema tolera todos los alias y
// normalizeIntake() los reduce a un único shape.

const vacioAUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v

const texto = (max: number) => z.preprocess(vacioAUndefined, z.string().max(max).optional())

export const intakeSchema = z
  .object({
    name: texto(200),
    email: z.preprocess(vacioAUndefined, z.string().email().optional()),
    phone: texto(30),
    message: texto(5000),
    source: texto(100),
    // alias en español
    nombre: texto(200),
    whatsapp: texto(30),
    telefono: texto(30),
    mensaje: texto(5000),
    origen: texto(100),
    // extras estructurados que enriquecen el lead
    empresa: texto(200),
    producto: texto(200),
    // dirección (para envío de muestras); ciudad/localidad son sinónimos
    direccion: texto(300),
    domicilio: texto(300),
    ciudad: texto(120),
    localidad: texto(120),
  })
  .passthrough()
  .refine((d) => Boolean(d.name ?? d.nombre), { message: 'Falta el nombre' })

export type IntakeNormalized = {
  name: string
  email: string | null
  phone: string | null
  message: string | null
  source: string
  empresa: string | null
  producto: string | null
  direccion: string | null
  localidad: string | null
  extras: Record<string, unknown>
}

// claves ya normalizadas (o irrelevantes) que no van a extras
const CAMPOS_BASE = new Set([
  'name', 'nombre', 'email', 'phone', 'whatsapp', 'telefono',
  'message', 'mensaje', 'source', 'origen', 'empresa', 'producto',
  'direccion', 'domicilio', 'ciudad', 'localidad',
  'empresa_web', 'fecha',
])

export function normalizeIntake(data: z.infer<typeof intakeSchema>): IntakeNormalized {
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (CAMPOS_BASE.has(k) || v == null || v === '') continue
    extras[k] = v
  }
  return {
    name: (data.name ?? data.nombre ?? '').trim(),
    email: data.email ?? null,
    phone: data.phone ?? data.whatsapp ?? data.telefono ?? null,
    message: data.message ?? data.mensaje ?? null,
    source: (data.source ?? data.origen ?? 'landing').trim(),
    empresa: data.empresa ?? null,
    producto: data.producto ?? null,
    direccion: data.direccion ?? data.domicilio ?? null,
    localidad: data.ciudad ?? data.localidad ?? null,
    extras,
  }
}

// Orden y etiquetas del resumen que se inserta como mensaje en el inbox.
// Pares (clave, etiqueta): claves distintas pueden compartir etiqueta porque
// las landings nombran igual a lo mismo (cantidad/volumen).
const ETIQUETAS_RESUMEN: Array<[string, string]> = [
  ['empresa', 'Empresa'],
  ['marca', 'Marca registrada'],
  ['direccion', 'Dirección'],
  ['localidad', 'Localidad'],
  ['provincia', 'Provincia'],
  ['producto', 'Producto'],
  ['cantidad', 'Volumen mensual'],
  ['volumen', 'Volumen mensual'],
  ['envasado', 'Envasado'],
  ['packaging', 'Packaging'],
  ['acepta_inversion_bobina', 'Acepta inversión en bobina'],
  ['inversionEstimada', 'Inversión estimada'],
  ['plazo', 'Plazo'],
  ['canal', 'Canal de venta'],
  ['situacion', 'Situación'],
  ['segmento', 'Segmento'],
  ['lead_grade', 'Calificación'],
  ['lead_score', 'Puntaje'],
]

export function buildIntakeResumen(d: IntakeNormalized): string {
  const campos: Record<string, unknown> = { ...d.extras }
  if (d.empresa) campos['empresa'] = d.empresa
  if (d.producto) campos['producto'] = d.producto
  if (d.direccion) campos['direccion'] = d.direccion
  if (d.localidad) campos['localidad'] = d.localidad

  const lineas: string[] = [`Nueva consulta desde ${d.source}`, '']
  const vistas = new Set<string>()
  for (const [clave, etiqueta] of ETIQUETAS_RESUMEN) {
    const v = campos[clave]
    if (v == null || v === '' || vistas.has(etiqueta)) continue
    vistas.add(etiqueta)
    lineas.push(`${etiqueta}: ${String(v)}`)
  }
  if (d.message) lineas.push('', `Mensaje: ${d.message}`)
  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const leadFiltersSchema = z.object({
  agentId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  source: z.enum(['whatsapp', 'landing', 'manual']).optional(),
  search: z.string().max(200).optional(),
  stageId: z.string().uuid().optional(),
})

// ─── Muestra CDA desde el lead ────────────────────────────────────────────────
// Mismo paso "Entrega" que cargan los agentes al crear un pedido: retiro en
// fábrica o envío por expreso (y cuál). El método es obligatorio para que
// fábrica sepa qué muestras se retiran y cuáles hay que despachar.
export const muestraLeadSchema = z.object({
  metodoEntrega: z.enum(['retiro_fabrica', 'expreso'], {
    errorMap: () => ({ message: 'Indicá cómo se entrega la muestra: retiro en fábrica o envío por expreso' }),
  }),
  expresoNombre: z.string().trim().max(200).optional().nullable(),
  expresoDireccion: z.string().trim().max(500).optional().nullable(),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type MuestraLeadInput = z.infer<typeof muestraLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type IntakeInput = z.infer<typeof intakeSchema>
export type LeadFilters = z.infer<typeof leadFiltersSchema>

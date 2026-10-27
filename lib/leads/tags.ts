/**
 * Etiquetas de leads: crear si no existe y colgar al lead (idempotente).
 * Lo usan el intake de landings y el bot (lista de espera, pide reunión).
 */
import { eq } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { tags, leadTags, activityLog } from '@/db/schema'
import { slugify } from '@/lib/utils'

/** Colores fijos por etiqueta conocida; el resto sale gris. */
const TAG_COLORS: Record<string, string> = {
  'web-alipro': '#C8102E',
  'landing-alfajores': '#ea580c',
  'landing-cda': '#2563eb',
  'pide-reunion': '#7c3aed',
  'nuevo-pedido': '#16a34a',
}

export { TAG_PIDE_REUNION, TAG_NUEVO_PEDIDO } from './tag-nombres'

/** "lista-espera-<producto>": el lead pidió algo que la planta no hace. */
export function tagListaEspera(producto: string): string {
  const slug = slugify(producto).slice(0, 40).replace(/-+$/, '')
  return slug ? `lista-espera-${slug}` : 'lista-espera'
}

function colorPara(nombre: string): string {
  if (TAG_COLORS[nombre]) return TAG_COLORS[nombre]!
  if (nombre.startsWith('lista-espera')) return '#b45309'
  return '#6b7280'
}

/** Devuelve el id del tag con ese nombre; lo crea si no existe (tolera carreras). */
export async function ensureTag(nombre: string, drizzleDb: Db = db): Promise<string> {
  const existing = await drizzleDb.query.tags.findFirst({ where: eq(tags.name, nombre) })
  if (existing) return existing.id

  const [created] = await drizzleDb
    .insert(tags)
    .values({ name: nombre, color: colorPara(nombre) })
    .onConflictDoNothing({ target: tags.name })
    .returning({ id: tags.id })
  if (created) return created.id

  // carrera: otro request lo creó entre el select y el insert
  const raced = await drizzleDb.query.tags.findFirst({ where: eq(tags.name, nombre) })
  if (!raced) throw new Error(`No se pudo crear el tag "${nombre}"`)
  return raced.id
}

/**
 * Cuelga el tag al lead (no duplica) y deja actividad `tag_added`.
 * Devuelve el id del tag.
 */
export async function agregarTagALead(
  leadId: string,
  nombre: string,
  opts: { userId?: string | null; motivo?: string; drizzleDb?: Db } = {},
): Promise<string> {
  const drizzleDb = opts.drizzleDb ?? db
  const tagId = await ensureTag(nombre, drizzleDb)
  await drizzleDb.insert(leadTags).values({ leadId, tagId }).onConflictDoNothing()
  await drizzleDb.insert(activityLog).values({
    leadId,
    userId: opts.userId ?? null,
    action: 'tag_added',
    metadata: { tagId, tagName: nombre, ...(opts.motivo ? { motivo: opts.motivo } : {}) },
  })
  return tagId
}

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { whatsappTemplates } from '@/db/schema'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { listMetaTemplates, planTemplateSync, parseMetaComponents } from '@/lib/whatsapp/templates'
import { eq, inArray } from 'drizzle-orm'

/**
 * Sincroniza la tabla local contra la WABA configurada actualmente.
 * - Actualiza estado/motivo de rechazo y formato del encabezado de las plantillas que existen en Meta.
 * - Borra las locales que no existen en la WABA actual (quedaron de otra cuenta
 *   o fueron eliminadas en Meta): no se pueden usar para enviar, así que no deben listarse.
 * - Importa las que están en Meta y acá no (creadas desde el Administrador de
 *   WhatsApp, p. ej. con imagen en el encabezado), sin variables configuradas.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async () => {
      const metaTemplates = await listMetaTemplates()
      const local = await db
        .select({ id: whatsappTemplates.id, name: whatsappTemplates.name, language: whatsappTemplates.language })
        .from(whatsappTemplates)

      const plan = planTemplateSync(local, metaTemplates)
      const now = new Date()

      for (const { localId, meta } of plan.updates) {
        const contenido = parseMetaComponents(meta.components)
        await db
          .update(whatsappTemplates)
          .set({
            status: meta.status,
            rejectedReason: meta.rejected_reason ?? null,
            metaTemplateId: meta.id,
            // Solo si Meta devolvió componentes: si no, no pisamos lo que hay
            ...(meta.components ? { headerFormat: contenido.headerFormat } : {}),
            syncedAt: now,
            updatedAt: now,
          })
          .where(eq(whatsappTemplates.id, localId))
      }

      if (plan.deleteIds.length > 0) {
        await db.delete(whatsappTemplates).where(inArray(whatsappTemplates.id, plan.deleteIds))
      }

      if (plan.inserts.length > 0) {
        await db.insert(whatsappTemplates).values(
          plan.inserts.map((meta) => {
            const contenido = parseMetaComponents(meta.components)
            return {
              metaTemplateId: meta.id,
              name: meta.name,
              language: meta.language,
              category: meta.category ?? 'UTILITY',
              status: meta.status,
              rejectedReason: meta.rejected_reason ?? null,
              bodyText: contenido.bodyText,
              headerText: contenido.headerText,
              headerFormat: contenido.headerFormat,
              footerText: contenido.footerText,
              buttons: contenido.buttons as object[],
              variables: [] as object[],
              createdBy: session.user.id,
              syncedAt: now,
            }
          }),
        )
      }

      return NextResponse.json({
        data: { synced: plan.updates.length, deleted: plan.deleteIds.length, imported: plan.inserts.length },
      })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

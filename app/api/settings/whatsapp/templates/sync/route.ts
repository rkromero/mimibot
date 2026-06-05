import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { whatsappTemplates } from '@/db/schema'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { listMetaTemplates } from '@/lib/whatsapp/templates'
import { and, eq } from 'drizzle-orm'

export async function POST() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async () => {
      const metaTemplates = await listMetaTemplates()
      const now = new Date()

      for (const mt of metaTemplates) {
        await db
          .update(whatsappTemplates)
          .set({
            status: mt.status,
            rejectedReason: mt.rejected_reason ?? null,
            metaTemplateId: mt.id,
            syncedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(whatsappTemplates.name, mt.name),
              eq(whatsappTemplates.language, mt.language),
            ),
          )
      }

      return NextResponse.json({ data: { synced: metaTemplates.length } })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

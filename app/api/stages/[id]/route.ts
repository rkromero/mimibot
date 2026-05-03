import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pipelineStages, leads } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'

const updateStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = updateStageSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
      }

      const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, id) })
      if (!stage) throw new NotFoundError('Etapa')

      const updates: Partial<typeof pipelineStages.$inferInsert> = { updatedAt: new Date() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.color !== undefined) updates.color = parsed.data.color

      const [updated] = await db
        .update(pipelineStages)
        .set(updates)
        .where(eq(pipelineStages.id, id))
        .returning()

      return NextResponse.json({ data: updated })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    return withAdminAuth(async () => {
      const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, id) })
      if (!stage) throw new NotFoundError('Etapa')
      if (!stage.isDeletable) throw new ValidationError('Esta etapa no puede eliminarse')

      // Verificar que no tenga leads
      const leadCount = await db.query.leads.findFirst({
        where: eq(leads.stageId, id),
        columns: { id: true },
      })
      if (leadCount) throw new ValidationError('No se puede eliminar una etapa con leads activos')

      await db.delete(pipelineStages).where(eq(pipelineStages.id, id))
      return NextResponse.json({ ok: true })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

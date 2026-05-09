import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, pipelineStages, activityLog, conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { updateLeadSchema } from '@/lib/validations/lead'
import { canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { emitLeadEvent } from '@/lib/realtime/broker'
import { convertirLeadACliente } from '@/lib/clientes/conversion'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessLead(session.user, id)

    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: {
        contact: true,
        stage: true,
        assignedUser: { columns: { id: true, name: true, avatarColor: true } },
        tags: { with: { tag: true } },
        conversation: true,
      },
    })

    if (!lead) throw new NotFoundError('Lead')

    return NextResponse.json({ data: lead })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessLead(session.user, id)

    const body: unknown = await req.json()
    const parsed = updateLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const current = await db.query.leads.findFirst({ where: eq(leads.id, id) })
    if (!current) throw new NotFoundError('Lead')

    const updates: Partial<typeof leads.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (parsed.data.stageId !== undefined) updates.stageId = parsed.data.stageId
    if (parsed.data.assignedTo !== undefined) updates.assignedTo = parsed.data.assignedTo
    if (parsed.data.budget !== undefined) updates.budget = parsed.data.budget
    if (parsed.data.productInterest !== undefined) updates.productInterest = parsed.data.productInterest
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes
    if (parsed.data.botEnabled !== undefined) updates.botEnabled = parsed.data.botEnabled
    if (parsed.data.customFields !== undefined) updates.customFields = parsed.data.customFields

    // Si cambia de etapa, verificar si es terminal o isWon
    let newStageIsWon = false
    if (parsed.data.stageId && parsed.data.stageId !== current.stageId) {
      const newStage = await db.query.pipelineStages.findFirst({
        where: eq(pipelineStages.id, parsed.data.stageId),
      })
      if (newStage?.isTerminal) updates.isOpen = false
      if (newStage?.isWon) newStageIsWon = true

      await db.insert(activityLog).values({
        leadId: id,
        userId: session.user.id,
        action: 'stage_changed',
        metadata: { fromStageId: current.stageId, toStageId: parsed.data.stageId },
      })
    }

    if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== current.assignedTo) {
      await db.insert(activityLog).values({
        leadId: id,
        userId: session.user.id,
        action: parsed.data.assignedTo ? 'assigned' : 'unassigned',
        metadata: { assignedTo: parsed.data.assignedTo, previousAssignee: current.assignedTo },
      })
    }

    if (parsed.data.botEnabled !== undefined) {
      await db.insert(activityLog).values({
        leadId: id,
        userId: session.user.id,
        action: parsed.data.botEnabled ? 'bot_enabled' : 'bot_disabled',
        metadata: {},
      })
    }

    const [updated] = await db.update(leads).set(updates).where(eq(leads.id, id)).returning()

    emitLeadEvent({
      type: 'lead_updated',
      leadId: id,
      assignedTo: updated!.assignedTo ?? null,
      oldAssigned: current.assignedTo ?? null,
      stageId: updated!.stageId,
      oldStageId: current.stageId,
    })

    // If stage changed to isWon, attempt to convert lead to cliente
    if (newStageIsWon) {
      try {
        await convertirLeadACliente(id, session.user.id, db)
      } catch (conversionErr) {
        console.error('[lead conversion] Error al convertir lead a cliente:', conversionErr)
        // Do not fail the request — conversion is best-effort
      }
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

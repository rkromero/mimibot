import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, activityLog } from '@/db/schema'
import { canAccessLead } from '@/lib/authz'
import { validateUuidParam } from '@/lib/api/validate-params'
import { recordatorioLeadSchema } from '@/lib/validations/lead'
import { textoRecordatorio, textoRecordatorioCumplido } from '@/lib/leads/recordatorio'
import { NotFoundError, toApiError } from '@/lib/errors'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Recordatorio de llamada del lead (uno por lead).
 *
 * PUT    → lo fija o lo reemplaza: { fecha: 'YYYY-MM-DD', nota?: string | null }
 * DELETE → lo da por cumplido (sin recordatorio no hace nada)
 *
 * Los dos dejan una nota de sistema en la actividad del lead.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const body: unknown = await req.json()
    const parsed = recordatorioLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      columns: { id: true },
    })
    if (!lead) throw new NotFoundError('Lead')

    const { fecha } = parsed.data
    const nota = parsed.data.nota?.trim() || null

    const [updated] = await db
      .update(leads)
      .set({ recordatorioAt: fecha, recordatorioNota: nota, recordatorioPor: session.user.id, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning({ recordatorioAt: leads.recordatorioAt, recordatorioNota: leads.recordatorioNota })

    await db.insert(activityLog).values({
      leadId: id,
      userId: session.user.id,
      action: 'note_added',
      metadata: { sistema: true, motivo: 'recordatorio', fecha, nota, texto: textoRecordatorio(fecha, nota) },
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      columns: { id: true, recordatorioAt: true, recordatorioNota: true },
    })
    if (!lead) throw new NotFoundError('Lead')
    if (!lead.recordatorioAt) return NextResponse.json({ data: null })

    await db
      .update(leads)
      .set({ recordatorioAt: null, recordatorioNota: null, recordatorioPor: null, updatedAt: new Date() })
      .where(eq(leads.id, id))

    await db.insert(activityLog).values({
      leadId: id,
      userId: session.user.id,
      action: 'note_added',
      metadata: {
        sistema: true,
        motivo: 'recordatorio_cumplido',
        fecha: lead.recordatorioAt,
        texto: textoRecordatorioCumplido(lead.recordatorioAt, lead.recordatorioNota),
      },
    })

    return NextResponse.json({ data: null })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

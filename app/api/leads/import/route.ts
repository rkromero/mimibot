import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, contacts, pipelineStages, activityLog, conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminOrGerente } from '@/lib/authz'
import { AuthzError } from '@/lib/errors'
import { toApiError } from '@/lib/errors'

const rowSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

const bodySchema = z.object({
  stageId: z.string().uuid(),
  assignedTo: z.string().uuid().optional().nullable(),
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdminOrGerente(session.user)

    const body: unknown = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { stageId, assignedTo, rows } = parsed.data

    const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, stageId) })
    if (!stage) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })

    if (session.user.role === 'gerente' && assignedTo) {
      const { getSessionContext } = await import('@/lib/territorios/context')
      const ctx = await getSessionContext(session.user)
      if (!ctx.agentesVisibles.includes(assignedTo)) {
        throw new AuthzError('No podés asignar a ese agente')
      }
    }

    let imported = 0
    const errors: Array<{ row: number; error: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      try {
        let contactId: string
        const existing = row.phone
          ? await db.query.contacts.findFirst({ where: eq(contacts.phone, row.phone) })
          : null

        if (existing) {
          contactId = existing.id
        } else {
          const [c] = await db
            .insert(contacts)
            .values({ name: row.name, phone: row.phone ?? null, email: row.email || null })
            .returning({ id: contacts.id })
          contactId = c!.id
        }

        const [lead] = await db
          .insert(leads)
          .values({
            contactId,
            stageId,
            assignedTo: assignedTo ?? null,
            source: 'manual',
            notes: row.notes ?? null,
            isOpen: !stage.isTerminal,
          })
          .returning()

        await db.insert(activityLog).values({
          leadId: lead!.id,
          userId: session.user.id,
          action: 'lead_created',
          metadata: { source: 'manual', bulk: true },
        })

        if (row.phone) {
          await db.insert(conversations).values({
            leadId: lead!.id,
            waContactPhone: row.phone,
            waPhoneNumberId: process.env['WA_PHONE_NUMBER_ID'] ?? null,
          })
        }

        imported++
      } catch {
        errors.push({ row: i + 1, error: `Fila ${i + 1}: error al importar` })
      }
    }

    return NextResponse.json({ data: { imported, errors } }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, contacts, pipelineStages, users, conversations, leadTags, tags, messages, activityLog } from '@/db/schema'
import { eq, and, ilike, inArray, desc, sql } from 'drizzle-orm'
import { createLeadSchema, leadFiltersSchema } from '@/lib/validations/lead'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const params = Object.fromEntries(req.nextUrl.searchParams)
    const filters = leadFiltersSchema.safeParse(params)
    if (!filters.success) {
      return NextResponse.json({ error: 'Filtros inválidos' }, { status: 400 })
    }

    const { agentId, tagId, source, search, stageId } = filters.data

    // Agentes solo ven sus leads
    const effectiveAgentId = session.user.role === 'agent' ? session.user.id : agentId

    const conditions = [eq(leads.isOpen, true)]
    if (effectiveAgentId) conditions.push(eq(leads.assignedTo, effectiveAgentId))
    if (source) conditions.push(eq(leads.source, source))
    if (stageId) conditions.push(eq(leads.stageId, stageId))

    let query = db
      .select({
        lead: leads,
        contact: contacts,
        stage: pipelineStages,
        assignedUser: {
          id: users.id,
          name: users.name,
          avatarColor: users.avatarColor,
        },
        unreadCount: conversations.unreadCount,
        lastMessageBody: messages.body,
        lastMessageType: messages.contentType,
        lastMessageAt: messages.sentAt,
        lastMessageDirection: messages.direction,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .leftJoin(users, eq(leads.assignedTo, users.id))
      .leftJoin(conversations, eq(conversations.leadId, leads.id))
      .leftJoin(
        messages,
        sql`${messages.id} = (
          SELECT id FROM messages
          WHERE conversation_id = ${conversations.id}
          ORDER BY sent_at DESC LIMIT 1
        )`,
      )
      .where(and(...conditions))
      .orderBy(desc(leads.updatedAt))

    if (search) {
      conditions.push(ilike(contacts.name, `%${search}%`))
    }

    const rows = await query

    // Si hay filtro por tag, filtrar en memoria (evita JOIN complejo para MVP)
    let result = rows
    if (tagId) {
      const leadIdsWithTag = await db
        .select({ leadId: leadTags.leadId })
        .from(leadTags)
        .where(eq(leadTags.tagId, tagId))
      const ids = new Set(leadIdsWithTag.map((r) => r.leadId))
      result = rows.filter((r) => ids.has(r.lead.id))
    }

    // Cargar tags para cada lead
    const leadIds = result.map((r) => r.lead.id)
    const allLeadTags =
      leadIds.length > 0
        ? await db
            .select({ leadId: leadTags.leadId, tag: tags })
            .from(leadTags)
            .innerJoin(tags, eq(leadTags.tagId, tags.id))
            .where(inArray(leadTags.leadId, leadIds))
        : []

    const tagsByLead = allLeadTags.reduce<Record<string, typeof tags.$inferSelect[]>>(
      (acc, r) => {
        ;(acc[r.leadId] ??= []).push(r.tag)
        return acc
      },
      {},
    )

    const data = result.map((r) => ({
      ...r.lead,
      contact: r.contact,
      stage: r.stage,
      assignedUser: r.assignedUser,
      tags: tagsByLead[r.lead.id] ?? [],
      unreadCount: r.unreadCount ?? 0,
      lastMessage: r.lastMessageBody
        ? {
            body: r.lastMessageBody,
            contentType: r.lastMessageType,
            sentAt: r.lastMessageAt,
            direction: r.lastMessageDirection,
          }
        : null,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body: unknown = await req.json()
    const parsed = createLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const input = parsed.data

    // Buscar o crear contacto por teléfono / email
    let contactId: string

    const existingContact = input.contactPhone
      ? await db.query.contacts.findFirst({ where: eq(contacts.phone, input.contactPhone) })
      : null

    if (existingContact) {
      contactId = existingContact.id
      // Actualizar nombre si cambió
      if (existingContact.name !== input.contactName) {
        await db.update(contacts).set({ name: input.contactName, updatedAt: new Date() }).where(eq(contacts.id, contactId))
      }
    } else {
      const [newContact] = await db
        .insert(contacts)
        .values({
          name: input.contactName,
          phone: input.contactPhone ?? null,
          email: input.contactEmail ?? null,
        })
        .returning({ id: contacts.id })
      contactId = newContact!.id
    }

    // Determinar etapa inicial
    const stage = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, input.stageId),
    })
    if (!stage) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })

    const [lead] = await db
      .insert(leads)
      .values({
        contactId,
        stageId: input.stageId,
        assignedTo: input.assignedTo ?? null,
        source: input.source,
        budget: input.budget ?? null,
        productInterest: input.productInterest ?? null,
        notes: input.notes ?? null,
        isOpen: !stage.isTerminal,
      })
      .returning()

    // Log de actividad
    await db.insert(activityLog).values({
      leadId: lead!.id,
      userId: session.user.id,
      action: 'lead_created',
      metadata: { source: input.source },
    })

    // Tags
    if (input.tags?.length) {
      await db.insert(leadTags).values(
        input.tags.map((tagId) => ({ leadId: lead!.id, tagId })),
      )
    }

    // Crear conversación si tiene teléfono
    if (input.contactPhone) {
      await db.insert(conversations).values({
        leadId: lead!.id,
        waContactPhone: input.contactPhone,
        waPhoneNumberId: process.env['WA_PHONE_NUMBER_ID'] ?? null,
      })
    }

    return NextResponse.json({ data: lead }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

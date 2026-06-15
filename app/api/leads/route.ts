import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, contacts, pipelineStages, users, conversations, leadTags, tags, messages, activityLog } from '@/db/schema'
import { eq, and, ilike, inArray, desc, sql, lt, or, isNull } from 'drizzle-orm'
import { createLeadSchema, leadFiltersSchema } from '@/lib/validations/lead'
import { toApiError } from '@/lib/errors'
import { esRolVentas } from '@/lib/authz/roles'

// ─── Cursor helpers ────────────────────────────────────────────────────────────

interface CursorPayload { updatedAt: string; id: string }

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id })).toString('base64url')
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString()) as CursorPayload
  } catch {
    return null
  }
}

// ─── Shared lead select shape ─────────────────────────────────────────────────

const leadSelect = {
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
}

async function attachTagsAndMessages(
  rows: (typeof leadSelect extends infer S ? Record<keyof S, unknown>[] : never)[],
) {
  // TypeScript-safe version that works with the actual query result
  return rows
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const params = Object.fromEntries(sp)
    const filters = leadFiltersSchema.safeParse(params)
    if (!filters.success) {
      return NextResponse.json({ error: 'Filtros inválidos' }, { status: 400 })
    }

    const { agentId, tagId, source, search, stageId } = filters.data

    // ── Role scoping ──────────────────────────────────────────────────────────
    let effectiveAgentId: string | undefined = agentId
    let gerenteAgenteIds: string[] | undefined

    if (esRolVentas(session.user.role)) {
      effectiveAgentId = session.user.id
    } else if (session.user.role === 'gerente') {
      const { getSessionContext } = await import('@/lib/territorios/context')
      const ctx = await getSessionContext(session.user)
      gerenteAgenteIds = ctx.agentesVisibles
      if (agentId && ctx.agentesVisibles.includes(agentId)) effectiveAgentId = agentId
    }

    const baseConditions = [eq(leads.isOpen, true), isNull(leads.deletedAt)]
    if (gerenteAgenteIds !== undefined) {
      if (gerenteAgenteIds.length === 0) {
        return stageId
          ? NextResponse.json({ data: [], hasMore: false, total: 0, nextCursor: null })
          : NextResponse.json({ data: [] })
      }
      if (effectiveAgentId) {
        baseConditions.push(eq(leads.assignedTo, effectiveAgentId))
      } else {
        baseConditions.push(inArray(leads.assignedTo, gerenteAgenteIds))
      }
    } else if (effectiveAgentId) {
      baseConditions.push(eq(leads.assignedTo, effectiveAgentId))
    }

    if (source) baseConditions.push(eq(leads.source, source))

    // ── Per-column cursor pagination (when stageId is provided) ───────────────
    if (stageId) {
      const rawLimit = sp.get('limit')
      const colLimit = Math.min(100, Math.max(1, parseInt(rawLimit ?? '20', 10) || 20))
      const rawCursor = sp.get('cursor') ?? null
      const conditions = [...baseConditions, eq(leads.stageId, stageId)]

      if (search) conditions.push(ilike(contacts.name, `%${search}%`))
      if (tagId) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM ${leadTags} WHERE ${leadTags.leadId} = ${leads.id} AND ${leadTags.tagId} = ${tagId})`,
        )
      }

      // Count without cursor for accurate total
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(leads)
        .innerJoin(contacts, eq(leads.contactId, contacts.id))
        .where(and(...conditions))

      const total = countRow?.total ?? 0

      // Apply cursor
      const conditionsWithCursor = [...conditions]
      if (rawCursor) {
        const cursor = decodeCursor(rawCursor)
        if (cursor) {
          const cursorDate = new Date(cursor.updatedAt)
          const tiebreaker = and(
            eq(leads.updatedAt, cursorDate),
            sql`${leads.id} < ${cursor.id}::uuid`,
          )
          const cursorSql = or(lt(leads.updatedAt, cursorDate), tiebreaker)
          if (cursorSql) conditionsWithCursor.push(cursorSql)
        }
      }

      const rows = await db
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
        })
        .from(leads)
        .innerJoin(contacts, eq(leads.contactId, contacts.id))
        .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
        .leftJoin(users, eq(leads.assignedTo, users.id))
        .leftJoin(conversations, eq(conversations.leadId, leads.id))
        .where(and(...conditionsWithCursor))
        .orderBy(desc(leads.updatedAt), sql`${leads.id} DESC`)
        .limit(colLimit + 1)

      const hasMore = rows.length > colLimit
      const page = rows.slice(0, colLimit)
      const lastRow = page[page.length - 1]
      const nextCursor = hasMore && lastRow
        ? encodeCursor(lastRow.lead.updatedAt, lastRow.lead.id)
        : null

      // Load tags for these leads
      const leadIds = page.map((r) => r.lead.id)
      const allLeadTags = leadIds.length > 0
        ? await db
            .select({ leadId: leadTags.leadId, tag: tags })
            .from(leadTags)
            .innerJoin(tags, eq(leadTags.tagId, tags.id))
            .where(inArray(leadTags.leadId, leadIds))
        : []

      const tagsByLead = allLeadTags.reduce<Record<string, typeof tags.$inferSelect[]>>(
        (acc, r) => { (acc[r.leadId] ??= []).push(r.tag); return acc },
        {},
      )

      const data = page.map((r) => ({
        ...r.lead,
        contact: r.contact,
        stage: r.stage,
        assignedUser: r.assignedUser,
        tags: tagsByLead[r.lead.id] ?? [],
        unreadCount: r.unreadCount ?? 0,
        lastMessage: null,
      }))

      return NextResponse.json({ data, hasMore, total, nextCursor })
    }

    // ── Board / list view: return all matching leads (existing behavior) ───────
    const conditions = [...baseConditions]
    if (source) conditions.push(eq(leads.source, source))
    if (stageId) conditions.push(eq(leads.stageId, stageId))

    const query = db
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

    let result = rows
    if (tagId) {
      const leadIdsWithTag = await db
        .select({ leadId: leadTags.leadId })
        .from(leadTags)
        .where(eq(leadTags.tagId, tagId))
      const ids = new Set(leadIdsWithTag.map((r) => r.leadId))
      result = rows.filter((r) => ids.has(r.lead.id))
    }

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
      (acc, r) => { (acc[r.leadId] ??= []).push(r.tag); return acc },
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
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const input = parsed.data

    const assignedTo =
      esRolVentas(session.user.role)
        ? session.user.id
        : (input.assignedTo ?? null)

    let contactId: string

    const existingContact = input.contactPhone
      ? await db.query.contacts.findFirst({ where: eq(contacts.phone, input.contactPhone) })
      : null

    if (existingContact) {
      contactId = existingContact.id
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

    const stage = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.id, input.stageId),
    })
    if (!stage) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })

    const [lead] = await db
      .insert(leads)
      .values({
        contactId,
        stageId: input.stageId,
        assignedTo,
        source: input.source,
        budget: input.budget ?? null,
        productInterest: input.productInterest ?? null,
        notes: input.notes ?? null,
        isOpen: !stage.isTerminal,
      })
      .returning()

    await db.insert(activityLog).values({
      leadId: lead!.id,
      userId: session.user.id,
      action: 'lead_created',
      metadata: { source: input.source },
    })

    if (input.tags?.length) {
      await db.insert(leadTags).values(
        input.tags.map((tagId) => ({ leadId: lead!.id, tagId })),
      )
    }

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

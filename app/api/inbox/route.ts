import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { conversations, leads, contacts, users } from '@/db/schema'
import { eq, and, isNull, desc, sql, inArray } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const filter = req.nextUrl.searchParams.get('filter') ?? 'mine'
    // Selector opcional "Ver por agente" — útil para gerente/admin con filter=all
    const filterVendedorId = req.nextUrl.searchParams.get('vendedorId') ?? null

    const conditions: ReturnType<typeof eq>[] = [eq(leads.isOpen, true) as ReturnType<typeof eq>]

    if (filter === 'mine') {
      conditions.push(eq(leads.assignedTo, session.user.id))
    } else if (filter === 'unassigned') {
      conditions.push(isNull(leads.assignedTo) as ReturnType<typeof eq>)
    } else if (filter === 'all') {
      // Agente en "todos" solo ve los suyos (no puede ver leads de otros).
      // Gerente ve los leads asignados a los agentes de sus territorios, con
      // selector opcional para filtrar a un agente específico.
      // Admin ve todos, con selector opcional también.
      if (session.user.role === 'agent') {
        conditions.push(eq(leads.assignedTo, session.user.id))
      } else if (session.user.role === 'gerente') {
        const ctx = await getSessionContext(session.user)
        if (ctx.agentesVisibles.length === 0) {
          return NextResponse.json({ data: [] })
        }
        if (filterVendedorId && ctx.agentesVisibles.includes(filterVendedorId)) {
          conditions.push(eq(leads.assignedTo, filterVendedorId))
        } else {
          conditions.push(inArray(leads.assignedTo, ctx.agentesVisibles) as ReturnType<typeof eq>)
        }
      } else if (session.user.role === 'admin' && filterVendedorId) {
        conditions.push(eq(leads.assignedTo, filterVendedorId))
      }
    }

    const rows = await db
      .select({
        conversationId: conversations.id,
        leadId: leads.id,
        contactName: contacts.name,
        contactPhone: contacts.phone,
        unreadCount: conversations.unreadCount,
        lastMessageAt: conversations.lastMessageAt,
        lastMessageBody: sql<string>`(
          SELECT body FROM messages m
          WHERE m.conversation_id = ${conversations.id}
          ORDER BY sent_at DESC LIMIT 1
        )`,
        lastMessageType: sql<string>`(
          SELECT content_type FROM messages m
          WHERE m.conversation_id = ${conversations.id}
          ORDER BY sent_at DESC LIMIT 1
        )`,
        assignedUserName: users.name,
        assignedUserColor: users.avatarColor,
        assignedUserId: users.id,
        botEnabled: leads.botEnabled,
      })
      .from(conversations)
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(users, eq(leads.assignedTo, users.id))
      .where(and(...conditions))
      .orderBy(desc(conversations.unreadCount), desc(conversations.lastMessageAt))
      .limit(100)

    return NextResponse.json({ data: rows })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { conversations, leads, contacts, messages, users } from '@/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const filter = req.nextUrl.searchParams.get('filter') ?? 'mine'

    const conditions = [eq(leads.isOpen, true)]

    if (filter === 'mine') {
      conditions.push(eq(leads.assignedTo, session.user.id))
    } else if (filter === 'unassigned') {
      conditions.push(isNull(leads.assignedTo))
    } else if (filter === 'all' && session.user.role !== 'admin') {
      // Agentes en "all" solo ven sus leads
      conditions.push(eq(leads.assignedTo, session.user.id))
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

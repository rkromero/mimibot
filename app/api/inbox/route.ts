import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { conversations, leads, contacts, clientes, users } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { parsePagination } from '@/lib/api/pagination'
import { esRolVentas } from '@/lib/authz/roles'

// CASE expression for the effective owner of a conversation:
// - client conversations → clientes.asignado_a
// - lead conversations   → leads.assigned_to
const effectiveOwner = sql<string | null>`
  CASE WHEN ${conversations.clienteId} IS NOT NULL
       THEN ${clientes.asignadoA}
       ELSE ${leads.assignedTo}
  END`

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const filter = sp.get('filter') ?? 'mine'
    const filterVendedorId = sp.get('vendedorId') ?? null
    const { page, limit } = parsePagination(sp, { page: 1, limit: 50 })

    // Base: pass if it's a cliente conversation (clienteId set) OR no lead OR lead is open.
    // This ensures lead→cliente converted conversations remain visible after the lead closes.
    //
    // Además, solo entran conversaciones con al menos un mensaje real
    // (`lastMessageAt` seteado): la conversación se "abre" en el inbox recién
    // cuando el vendedor le escribe o la persona escribe por WhatsApp. Un lead
    // recién creado (landing, alta manual, import) tiene la fila de
    // conversación pero no aparece acá hasta entonces.
    const baseCondition = sql`(
      ${conversations.lastMessageAt} IS NOT NULL
      AND (
        ${conversations.clienteId} IS NOT NULL
        OR ${leads.id} IS NULL
        OR (${leads.isOpen} = true AND ${leads.deletedAt} IS NULL)
      )
    )`

    const filterConditions: ReturnType<typeof sql>[] = []

    const isRestrictedRole = esRolVentas(session.user.role)

    if (filter === 'mine' || (filter === 'unassigned' && isRestrictedRole)) {
      // vendedor/agent never see unassigned — clamp to their own conversations
      filterConditions.push(
        sql`(CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END) = ${session.user.id}::uuid`,
      )
    } else if (filter === 'unassigned') {
      filterConditions.push(
        sql`(CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END) IS NULL`,
      )
    } else if (filter === 'all') {
      if (isRestrictedRole) {
        filterConditions.push(
          sql`(CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END) = ${session.user.id}::uuid`,
        )
      } else if (session.user.role === 'gerente') {
        const ctx = await getSessionContext(session.user)
        if (ctx.agentesVisibles.length === 0) {
          return NextResponse.json({ data: [], page: 1, limit, total: 0, totalPages: 1 })
        }
        const targetIds = filterVendedorId && ctx.agentesVisibles.includes(filterVendedorId)
          ? [filterVendedorId]
          : ctx.agentesVisibles
        filterConditions.push(
          sql`(CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END) = ANY(ARRAY[${sql.join(targetIds.map((id) => sql`${id}::uuid`), sql`, `)}])`,
        )
      } else if (session.user.role === 'admin' && filterVendedorId) {
        filterConditions.push(
          sql`(CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END) = ${filterVendedorId}::uuid`,
        )
      }
    }

    const whereClause = filterConditions.length > 0
      ? and(baseCondition, ...filterConditions)
      : baseCondition

    // Total de no leídos para la burbuja del menú: mismo scoping, sin filas
    if (sp.get('soloNoLeidos') === 'true') {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${conversations.unreadCount}), 0)::int` })
        .from(conversations)
        .leftJoin(leads, eq(conversations.leadId, leads.id))
        .leftJoin(clientes, eq(conversations.clienteId, clientes.id))
        .where(whereClause)
      return NextResponse.json({ total: row?.total ?? 0 })
    }

    const rows = await db
      .select({
        conversationId: conversations.id,
        // Un lead ABIERTO manda sobre el cliente: el panel de lead tiene el
        // cotizador y la etapa (conversación unificada lead+cliente). Cuando
        // el lead se cierra, vuelve a verse como la conversación del cliente.
        // El ACCESO no cambia: sigue mandando el dueño del cliente (ver
        // effectiveOwner y canAccessConversacion).
        tipo: sql<'cliente' | 'lead'>`CASE
          WHEN ${leads.id} IS NOT NULL AND ${leads.isOpen} THEN 'lead'
          WHEN ${conversations.clienteId} IS NOT NULL THEN 'cliente'
          ELSE 'lead' END`,
        leadId: conversations.leadId,
        clienteId: conversations.clienteId,
        nombre: sql<string>`CASE
          WHEN ${leads.id} IS NOT NULL AND ${leads.isOpen} THEN ${contacts.name}
          WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.nombre} || ' ' || ${clientes.apellido}
          ELSE ${contacts.name} END`,
        contactPhone: sql<string>`CASE
          WHEN ${leads.id} IS NOT NULL AND ${leads.isOpen} THEN ${contacts.phone}
          WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.telefono}
          ELSE ${contacts.phone} END`,
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
        assignedUserId: effectiveOwner,
        assignedUserName: users.name,
        assignedUserColor: users.avatarColor,
        botEnabled: leads.botEnabled,
      })
      .from(conversations)
      .leftJoin(leads, eq(conversations.leadId, leads.id))
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(clientes, eq(conversations.clienteId, clientes.id))
      .leftJoin(
        users,
        sql`${users.id} = CASE WHEN ${conversations.clienteId} IS NOT NULL THEN ${clientes.asignadoA} ELSE ${leads.assignedTo} END`,
      )
      .where(whereClause)
      .orderBy(desc(conversations.unreadCount), desc(conversations.lastMessageAt))
      .limit(limit)
      .offset((page - 1) * limit)

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(conversations)
      .leftJoin(leads, eq(conversations.leadId, leads.id))
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(clientes, eq(conversations.clienteId, clientes.id))
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    return NextResponse.json({ data: rows, page, limit, total, totalPages })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

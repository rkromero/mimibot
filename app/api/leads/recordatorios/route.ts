import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, contacts, pipelineStages, users } from '@/db/schema'
import { esRolVentas } from '@/lib/authz/roles'
import { todayStrAR } from '@/lib/dates'
import { toApiError } from '@/lib/errors'
import type { RecordatorioHoy } from '@/lib/leads/recordatorio'

/**
 * Recordatorios de llamada pendientes para hoy (los de hoy + los vencidos),
 * del más atrasado al de hoy. Alimenta el popup al abrir el sistema y la
 * tarjeta "Para llamar hoy" de Mi día.
 *
 * Alcance por defecto ("mios"): leads abiertos asignados al usuario o cuyo
 * recordatorio puso él. Admin y gerente pueden pedir ?alcance=equipo
 * (todos los leads / los de sus agentes).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const hoy = todayStrAR()
    const userId = session.user.id
    const role = session.user.role
    const equipo = req.nextUrl.searchParams.get('alcance') === 'equipo' && !esRolVentas(role)

    const conds = [
      eq(leads.isOpen, true),
      isNull(leads.deletedAt),
      isNotNull(leads.recordatorioAt),
      lte(leads.recordatorioAt, hoy),
    ]

    if (!equipo) {
      const propio = or(eq(leads.assignedTo, userId), eq(leads.recordatorioPor, userId))
      if (propio) conds.push(propio)
    } else if (role === 'gerente') {
      const { getSessionContext } = await import('@/lib/territorios/context')
      const ctx = await getSessionContext(session.user)
      if (ctx.agentesVisibles.length === 0) return NextResponse.json({ data: [], hoy, total: 0 })
      conds.push(inArray(leads.assignedTo, ctx.agentesVisibles))
    }

    const rows = await db
      .select({
        leadId: leads.id,
        nombre: contacts.name,
        telefono: contacts.phone,
        fecha: leads.recordatorioAt,
        nota: leads.recordatorioNota,
        etapa: pipelineStages.name,
        etapaColor: pipelineStages.color,
        asignadoNombre: users.name,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .leftJoin(users, eq(leads.assignedTo, users.id))
      .where(and(...conds))
      .orderBy(asc(leads.recordatorioAt), asc(contacts.name))
      .limit(200)

    const data: RecordatorioHoy[] = rows.map((r) => ({
      ...r,
      fecha: r.fecha ?? hoy,
      vencido: (r.fecha ?? hoy) < hoy,
    }))

    return NextResponse.json({ data, hoy, total: data.length })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

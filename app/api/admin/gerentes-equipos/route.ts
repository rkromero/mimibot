import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { users, territorioGerente, territorioAgente } from '@/db/schema'
import { eq, inArray, isNull, and } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { requireAdmin } from '@/lib/authz'

/**
 * Endpoint admin-only que devuelve, para cada gerente activo, qué agentes tiene
 * a cargo. Un agente está "a cargo" de un gerente si ambos están asignados al
 * mismo territorio (territorioGerente ∩ territorioAgente activo).
 *
 * Lo usa el dashboard de admin para poder agrupar el ranking por gerente y
 * mostrar la suma agregada de las métricas de su equipo.
 *
 * Formato de salida:
 *   [
 *     { gerenteId, gerenteName, gerenteEmail, agenteIds: [uuid, uuid, ...] },
 *     ...
 *   ]
 *
 * Si un gerente está asignado pero no tiene agentes en ninguno de sus
 * territorios, su `agenteIds` viene vacío. Si tiene agentes que aparecen en
 * varios territorios, salen únicos (Set).
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    // 1) Todos los gerentes activos
    const gerentesRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.role, 'gerente'))

    if (gerentesRows.length === 0) return NextResponse.json({ data: [] })

    const gerenteIds = gerentesRows.map((g) => g.id)

    // 2) Territorios que gestiona cada gerente
    const tg = await db
      .select({
        gerenteId: territorioGerente.gerenteId,
        territorioId: territorioGerente.territorioId,
      })
      .from(territorioGerente)
      .where(inArray(territorioGerente.gerenteId, gerenteIds))

    if (tg.length === 0) {
      // Ningún gerente tiene territorios asignados
      const data = gerentesRows.map((g) => ({
        gerenteId: g.id,
        gerenteName: g.name,
        gerenteEmail: g.email,
        agenteIds: [] as string[],
      }))
      return NextResponse.json({ data })
    }

    // 3) Agentes activos en esos territorios
    const territorioIds = [...new Set(tg.map((t) => t.territorioId))]
    const ta = await db
      .select({
        agenteId: territorioAgente.agenteId,
        territorioId: territorioAgente.territorioId,
      })
      .from(territorioAgente)
      .where(and(
        inArray(territorioAgente.territorioId, territorioIds),
        isNull(territorioAgente.fechaDesasignacion),
      ))

    // 4) Construir el mapping territorio → gerentes y luego gerente → agentes
    const territorioToGerentes = new Map<string, Set<string>>()
    for (const row of tg) {
      if (!territorioToGerentes.has(row.territorioId)) {
        territorioToGerentes.set(row.territorioId, new Set())
      }
      territorioToGerentes.get(row.territorioId)!.add(row.gerenteId)
    }

    const gerenteToAgentes = new Map<string, Set<string>>()
    for (const g of gerentesRows) gerenteToAgentes.set(g.id, new Set())

    for (const a of ta) {
      const gerentes = territorioToGerentes.get(a.territorioId)
      if (!gerentes) continue
      for (const gId of gerentes) {
        gerenteToAgentes.get(gId)?.add(a.agenteId)
      }
    }

    const data = gerentesRows.map((g) => ({
      gerenteId: g.id,
      gerenteName: g.name,
      gerenteEmail: g.email,
      agenteIds: Array.from(gerenteToAgentes.get(g.id) ?? []),
    }))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

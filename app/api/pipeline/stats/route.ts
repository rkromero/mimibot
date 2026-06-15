import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, pipelineStages } from '@/db/schema'
import { and, eq, gte, lt, isNull, inArray, sql, type SQL } from 'drizzle-orm'
import { todayStrAR, parseFechaAR } from '@/lib/dates'
import { toApiError } from '@/lib/errors'
import { esRolVentas } from '@/lib/authz/roles'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mesActualAR(): { inicioMes: Date; finMes: Date } {
  const today = todayStrAR() // "YYYY-MM-DD" en timezone AR
  const parts = today.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  // Medianoche AR = 03:00 UTC (UTC-3 sin DST)
  const inicioMes = parseFechaAR(`${y}-${String(m).padStart(2, '0')}-01`)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const finMes = parseFechaAR(`${nextY}-${String(nextM).padStart(2, '0')}-01`)
  return { inicioMes, finMes }
}

// ─── GET /api/pipeline/stats ──────────────────────────────────────────────────
// Devuelve { ganadoMes, perdidoMes } para el usuario logueado según su rol.
// Los filtros del pipeline (agente/fuente/búsqueda) NO aplican aquí.

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { inicioMes, finMes } = mesActualAR()

    // ── Scoping por rol ───────────────────────────────────────────────────────
    const roleConditions: SQL<unknown>[] = []

    if (esRolVentas(session.user.role)) {
      // Vendedor/agente: solo sus propios leads
      roleConditions.push(eq(leads.assignedTo, session.user.id))
    } else if (session.user.role === 'gerente') {
      // Gerente: leads de los agentes en sus territorios
      const { getSessionContext } = await import('@/lib/territorios/context')
      const ctx = await getSessionContext(session.user)
      if (ctx.agentesVisibles.length === 0) {
        return NextResponse.json({ ganadoMes: 0, perdidoMes: 0 })
      }
      roleConditions.push(inArray(leads.assignedTo, ctx.agentesVisibles))
    }
    // admin: sin filtro adicional

    // ── ganadoMes: etapas isWon=true, won_at en el mes AR ────────────────────
    const ganadoConditions: (SQL<unknown> | undefined)[] = [
      eq(leads.isOpen, false),
      eq(pipelineStages.isWon, true),
      isNull(leads.deletedAt),
      gte(leads.wonAt, inicioMes),
      lt(leads.wonAt, finMes),
      ...roleConditions,
    ]

    const [ganadoRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .where(and(...ganadoConditions))

    // ── perdidoMes: isTerminal=true, isWon=false, updated_at en el mes AR ────
    // No existe lostAt; updated_at es el proxy (el lead queda sin editar al cerrarse)
    const perdidoConditions: (SQL<unknown> | undefined)[] = [
      eq(leads.isOpen, false),
      eq(pipelineStages.isTerminal, true),
      eq(pipelineStages.isWon, false),
      isNull(leads.deletedAt),
      gte(leads.updatedAt, inicioMes),
      lt(leads.updatedAt, finMes),
      ...roleConditions,
    ]

    const [perdidoRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .where(and(...perdidoConditions))

    return NextResponse.json({
      ganadoMes: ganadoRow?.count ?? 0,
      perdidoMes: perdidoRow?.count ?? 0,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { territorioAgente, territorioGerente } from '@/db/schema'
import type { Session } from 'next-auth'

export type SessionContext = {
  userId: string
  role: 'admin' | 'gerente' | 'agent'
  /** Territorios que gestiona este gerente */
  territoriosGestionados: string[]
  /** Agentes en los territorios del gerente (para scoping de queries) */
  agentesVisibles: string[]
  /** Territorios donde este usuario es agente activo */
  territoriosActivos: string[]
}

export async function getSessionContext(user: Session['user']): Promise<SessionContext> {
  const base: SessionContext = {
    userId: user.id,
    role: user.role,
    territoriosGestionados: [],
    agentesVisibles: [],
    territoriosActivos: [],
  }

  if (user.role === 'admin') return base

  if (user.role === 'agent') {
    const activos = await db.query.territorioAgente.findMany({
      where: and(
        eq(territorioAgente.agenteId, user.id),
        isNull(territorioAgente.fechaDesasignacion),
      ),
      columns: { territorioId: true },
    })
    base.territoriosActivos = activos.map((a) => a.territorioId)
    return base
  }

  if (user.role === 'gerente') {
    const gerencias = await db.query.territorioGerente.findMany({
      where: eq(territorioGerente.gerenteId, user.id),
      columns: { territorioId: true },
    })
    const territorioIds = gerencias.map((g) => g.territorioId)
    base.territoriosGestionados = territorioIds

    if (territorioIds.length > 0) {
      const agentesRows = await db.query.territorioAgente.findMany({
        where: inArray(territorioAgente.territorioId, territorioIds),
        columns: { agenteId: true },
      })
      base.agentesVisibles = [...new Set(agentesRows.map((r) => r.agenteId))]
    }

    return base
  }

  return base
}

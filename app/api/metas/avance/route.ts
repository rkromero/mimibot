import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import {
  calcularAvanceVendedor,
  calcularAvanceTodos,
} from '@/lib/metas/avance.service'
import { getSessionContext } from '@/lib/territorios/context'
import { db } from '@/db'
import { territorioAgente, territorioGerente } from '@/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'

async function getAgentesDeTerritorioOGerente(
  territorioId?: string | null,
  gerenteId?: string | null,
): Promise<string[] | null> {
  if (territorioId) {
    const rows = await db.query.territorioAgente.findMany({
      where: eq(territorioAgente.territorioId, territorioId),
      columns: { agenteId: true },
    })
    return rows.map((r) => r.agenteId)
  }
  if (gerenteId) {
    const gerencias = await db.query.territorioGerente.findMany({
      where: eq(territorioGerente.gerenteId, gerenteId),
      columns: { territorioId: true },
    })
    if (gerencias.length === 0) return []
    const agentesRows = await db.query.territorioAgente.findMany({
      where: inArray(territorioAgente.territorioId, gerencias.map((g) => g.territorioId)),
      columns: { agenteId: true },
    })
    return [...new Set(agentesRows.map((r) => r.agenteId))]
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const now = new Date()
    const params = req.nextUrl.searchParams

    const anio = params.has('anio') ? parseInt(params.get('anio')!, 10) : now.getFullYear()
    const mes = params.has('mes') ? parseInt(params.get('mes')!, 10) : now.getMonth() + 1

    if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12 || anio < 2020) {
      return NextResponse.json({ error: 'Parámetros anio/mes inválidos' }, { status: 400 })
    }

    const ctx = await getSessionContext(session.user)

    if (ctx.role === 'agent') {
      const avance = await calcularAvanceVendedor(ctx.userId, anio, mes)
      return NextResponse.json({ data: avance })
    }

    const vendedorId = params.get('vendedorId')
    const territorioId = params.get('territorioId')
    const gerenteIdParam = params.get('gerenteId')

    // Single vendor lookup
    if (vendedorId) {
      // Gerente: can only see their agents
      if (ctx.role === 'gerente' && !ctx.agentesVisibles.includes(vendedorId)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }
      const avance = await calcularAvanceVendedor(vendedorId, anio, mes)
      return NextResponse.json({ data: avance })
    }

    // Gerente: scope to their agents (with optional territory drill-down)
    if (ctx.role === 'gerente') {
      let agenteIds = ctx.agentesVisibles
      if (territorioId) {
        // Filter to agents of a specific territory within their scope
        if (!ctx.territoriosGestionados.includes(territorioId)) {
          return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }
        const rows = await db.query.territorioAgente.findMany({
          where: eq(territorioAgente.territorioId, territorioId),
          columns: { agenteId: true },
        })
        agenteIds = rows.map((r) => r.agenteId)
      }
      if (agenteIds.length === 0) return NextResponse.json({ data: [] })
      const avances = await calcularAvanceTodos(anio, mes)
      const filtrados = avances.filter((a) => agenteIds.includes(a.meta.vendedorId))
      return NextResponse.json({ data: filtrados })
    }

    // Admin: optional filters by territorio or gerente
    const scopeAgentes = await getAgentesDeTerritorioOGerente(
      territorioId ?? null,
      gerenteIdParam ?? null,
    )

    const avances = await calcularAvanceTodos(anio, mes)
    const filtrados = scopeAgentes !== null
      ? avances.filter((a) => scopeAgentes.includes(a.meta.vendedorId))
      : avances

    return NextResponse.json({ data: filtrados })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { assignmentConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

type Rule = 'fixed' | 'random' | 'weighted' | 'round_robin'

// ─── Validation schema ────────────────────────────────────────────────────────

const weightEntrySchema = z.object({
  agentId: z.string().uuid(),
  weight: z.number().positive(),
})

const putSchema = z.discriminatedUnion('rule', [
  z.object({
    rule: z.literal('fixed'),
    fixedAgentId: z.string().uuid('Agente requerido para la regla fija'),
  }),
  z.object({
    rule: z.literal('random'),
  }),
  z.object({
    rule: z.literal('round_robin'),
  }),
  z.object({
    rule: z.literal('weighted'),
    weights: z
      .array(weightEntrySchema)
      .min(1, 'Se requiere al menos un agente con peso'),
  }),
])

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const [config, activeAgents] = await Promise.all([
      db.query.assignmentConfig.findFirst({ where: eq(assignmentConfig.id, 1) }),
      db.query.users.findMany({
        where: (u, { and, inArray: sqlInArray, eq: sqlEq }) =>
          and(sqlInArray(u.role, ['agent', 'vendedor']), sqlEq(u.isActive, true)),
        columns: { id: true, name: true },
        orderBy: (u, { asc }) => [asc(u.name)],
      }),
    ])

    return NextResponse.json({
      data: {
        config: config ?? null,
        agents: activeAgents,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async (user) => {
      const body: unknown = await req.json()
      const parsed = putSchema.safeParse(body)
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Datos inválidos'
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      // Fetch active agents for validation
      const activeAgents = await db.query.users.findMany({
        where: (u, { and, inArray: sqlInArray, eq: sqlEq }) =>
          and(sqlInArray(u.role, ['agent', 'vendedor']), sqlEq(u.isActive, true)),
        columns: { id: true },
      })
      const activeIds = new Set(activeAgents.map((a) => a.id))

      const data = parsed.data
      type UpdatePayload = {
        rule: Rule
        fixedAgentId: string | null
        weights: Array<{ agentId: string; weight: number }>
        roundRobinPointer: number
        updatedBy: string
        updatedAt: Date
      }
      let updates: UpdatePayload

      if (data.rule === 'fixed') {
        if (!activeIds.has(data.fixedAgentId)) {
          return NextResponse.json(
            { error: 'El agente seleccionado no existe o no está activo' },
            { status: 400 },
          )
        }
        updates = {
          rule: 'fixed',
          fixedAgentId: data.fixedAgentId,
          weights: [],
          roundRobinPointer: 0,
          updatedBy: user.id,
          updatedAt: new Date(),
        }
      } else if (data.rule === 'weighted') {
        // Validate all agent IDs are active
        const invalidIds = data.weights.filter((w) => !activeIds.has(w.agentId))
        if (invalidIds.length > 0) {
          return NextResponse.json(
            { error: 'Uno o más agentes no existen o no están activos' },
            { status: 400 },
          )
        }
        // Validate sum == 100
        const total = data.weights.reduce((s, w) => s + w.weight, 0)
        if (Math.abs(total - 100) > 0.01) {
          return NextResponse.json(
            { error: `Los pesos deben sumar 100 (actual: ${total.toFixed(1)})` },
            { status: 400 },
          )
        }
        updates = {
          rule: 'weighted',
          fixedAgentId: null,
          weights: data.weights,
          roundRobinPointer: 0,
          updatedBy: user.id,
          updatedAt: new Date(),
        }
      } else {
        // random | round_robin
        updates = {
          rule: data.rule,
          fixedAgentId: null,
          weights: [],
          roundRobinPointer: data.rule === 'round_robin' ? 0 : 0,
          updatedBy: user.id,
          updatedAt: new Date(),
        }
      }

      await db
        .insert(assignmentConfig)
        .values({ id: 1, ...updates })
        .onConflictDoUpdate({ target: assignmentConfig.id, set: updates })

      return NextResponse.json({ data: { ok: true } })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

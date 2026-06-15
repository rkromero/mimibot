import { db } from '@/db'
import { sql } from 'drizzle-orm'

type WeightEntry = { agentId: string; weight: number }

type ConfigRow = {
  rule: 'fixed' | 'random' | 'weighted' | 'round_robin'
  fixed_agent_id: string | null
  weights: WeightEntry[]
  round_robin_pointer: number
}

export async function assignLeadByRule(rng = Math.random): Promise<string | null> {
  const configRows = await db.execute(sql`
    SELECT rule, fixed_agent_id, weights, round_robin_pointer
    FROM assignment_config WHERE id = 1 LIMIT 1
  `)
  const config = (configRows as unknown as ConfigRow[])[0] ?? null

  const eligibleRows = await db.execute(sql`
    SELECT id FROM users
    WHERE role IN ('agent', 'vendedor', 'rtv') AND is_active = true
    ORDER BY id
  `)
  const eligible = eligibleRows as unknown as Array<{ id: string }>

  if (eligible.length === 0) return null

  const eligibleSet = new Set(eligible.map((a) => a.id))
  const rule = config?.rule ?? 'round_robin'

  switch (rule) {
    case 'fixed': {
      const fixedId = config?.fixed_agent_id ?? null
      if (fixedId && eligibleSet.has(fixedId)) return fixedId
      return doRoundRobin(eligible, config?.round_robin_pointer ?? 0)
    }

    case 'random':
      return eligible[Math.floor(rng() * eligible.length)]!.id

    case 'weighted': {
      const rawWeights = config?.weights ?? []
      const active = rawWeights.filter((w) => eligibleSet.has(w.agentId) && w.weight > 0)
      if (active.length === 0) {
        return eligible[Math.floor(rng() * eligible.length)]!.id
      }
      const total = active.reduce((s, w) => s + w.weight, 0)
      let cursor = rng() * total
      for (const w of active) {
        cursor -= w.weight
        if (cursor <= 0) return w.agentId
      }
      return active[active.length - 1]!.agentId
    }

    default: // round_robin
      return doRoundRobin(eligible, config?.round_robin_pointer ?? 0)
  }
}

async function doRoundRobin(
  eligible: Array<{ id: string }>,
  pointer: number,
): Promise<string> {
  const idx = pointer % eligible.length
  const agentId = eligible[idx]!.id
  await db.execute(
    sql`UPDATE assignment_config SET round_robin_pointer = round_robin_pointer + 1 WHERE id = 1`,
  )
  return agentId
}

export async function assignNextAgent(): Promise<string | null> {
  return assignLeadByRule()
}

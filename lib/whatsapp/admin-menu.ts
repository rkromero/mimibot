/**
 * Admin WhatsApp menu — configures assignment_config via interactive messages.
 *
 * STATE STORAGE: in-memory Map keyed by phone, with a 5-minute TTL.
 * Chosen over a DB table (no schema changes needed) and over an extra column in
 * assignment_config (keeps that table clean). Trade-off: state is lost on
 * server restart, acceptable for a short-lived admin UI flow.
 */

import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { assignmentConfig } from '@/db/schema'
import { sendTextMessage, sendInteractiveList } from './client'

// ─── In-memory session state ──────────────────────────────────────────────────

type AdminStep = 'awaiting_rule' | 'awaiting_fixed_agent' | 'awaiting_weighted_input'

const sessionMap = new Map<string, { step: AdminStep; expiresAt: number }>()
const SESSION_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getStep(phone: string): AdminStep | null {
  const s = sessionMap.get(phone)
  if (!s) return null
  if (Date.now() > s.expiresAt) {
    sessionMap.delete(phone)
    return null
  }
  return s.step
}

function setStep(phone: string, step: AdminStep): void {
  sessionMap.set(phone, { step, expiresAt: Date.now() + SESSION_TTL_MS })
}

function clearStep(phone: string): void {
  sessionMap.delete(phone)
}

// ─── Trigger words ────────────────────────────────────────────────────────────

const TRIGGERS = new Set(['menu', 'admin', '/regla'])

// ─── Agent helpers ────────────────────────────────────────────────────────────

type AgentRow = { id: string; name: string | null }

async function getActiveAgents(): Promise<AgentRow[]> {
  const rows = await db.execute(sql`
    SELECT id, name FROM users
    WHERE role IN ('agent', 'vendedor') AND is_active = true
    ORDER BY name LIMIT 10
  `)
  return rows as unknown as AgentRow[]
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendRuleMenu(phone: string): Promise<void> {
  await sendInteractiveList(
    phone,
    'Seleccioná la regla de asignación de leads:',
    [
      {
        title: 'Reglas disponibles',
        rows: [
          { id: 'rule_fixed',       title: 'Todo a un agente',  description: 'Un único agente recibe todos' },
          { id: 'rule_random',      title: 'Aleatorio',          description: 'Asignación aleatoria uniforme' },
          { id: 'rule_weighted',    title: 'Ponderado',          description: 'Distribución por porcentaje' },
          { id: 'rule_round_robin', title: 'Round-robin',        description: 'Turno rotativo entre agentes' },
        ],
      },
    ],
  )
}

async function sendAgentListMenu(phone: string): Promise<void> {
  const agents = await getActiveAgents()
  if (agents.length === 0) {
    await sendTextMessage(phone, 'No hay agentes activos. Activá al menos uno primero.')
    clearStep(phone)
    return
  }
  await sendInteractiveList(
    phone,
    'Seleccioná el agente que recibirá todos los leads:',
    [
      {
        title: 'Agentes activos',
        rows: agents.map((a) => ({
          id: `agent_${a.id}`,
          title: (a.name ?? a.id).slice(0, 24),
        })),
      },
    ],
  )
}

async function sendWeightedPrompt(phone: string): Promise<void> {
  const agents = await getActiveAgents()
  if (agents.length === 0) {
    await sendTextMessage(phone, 'No hay agentes activos disponibles.')
    clearStep(phone)
    return
  }
  const list = agents.map((a) => `• ${a.name ?? a.id}`).join('\n')
  const example = [
    agents[0]?.name ?? 'Agente1',
    agents[1]?.name ?? 'Agente2',
  ]
  await sendTextMessage(
    phone,
    `Ingresá los pesos en el formato:\n` +
    `_Nombre:porcentaje, Nombre:porcentaje_\n\n` +
    `Los porcentajes deben sumar 100.\n\n` +
    `Agentes disponibles:\n${list}\n\n` +
    `Ejemplo: ${example[0]}:70, ${example[1]}:30`,
  )
}

// ─── Weight parser ────────────────────────────────────────────────────────────

function parseWeights(
  input: string,
  agents: AgentRow[],
):
  | { valid: true; weights: Array<{ agentId: string; weight: number }> }
  | { valid: false; error: string } {
  const tokens = input.split(',').map((s) => s.trim()).filter(Boolean)
  if (tokens.length === 0) {
    return { valid: false, error: 'No se encontraron pares Nombre:porcentaje.' }
  }

  const weights: Array<{ agentId: string; weight: number }> = []
  let total = 0

  for (const token of tokens) {
    const colonIdx = token.lastIndexOf(':')
    if (colonIdx < 0) {
      return { valid: false, error: `Formato inválido en "${token}". Usá: Nombre:porcentaje` }
    }
    const rawName = token.slice(0, colonIdx).trim()
    const pctStr = token.slice(colonIdx + 1).trim()
    const pct = parseFloat(pctStr)
    if (!rawName || isNaN(pct) || pct <= 0) {
      return { valid: false, error: `Porcentaje inválido "${pctStr}" para "${rawName}".` }
    }
    const agent = agents.find((a) => (a.name ?? '').toLowerCase() === rawName.toLowerCase())
    if (!agent) {
      return { valid: false, error: `Agente "${rawName}" no encontrado entre los agentes activos.` }
    }
    weights.push({ agentId: agent.id, weight: pct })
    total += pct
  }

  if (Math.abs(total - 100) > 0.01) {
    return { valid: false, error: `Los porcentajes deben sumar 100 (actual: ${total.toFixed(1)}).` }
  }

  return { valid: true, weights }
}

// ─── Persist ──────────────────────────────────────────────────────────────────

const RULE_LABELS: Record<string, string> = {
  fixed: 'Todo a un agente',
  random: 'Aleatorio',
  weighted: 'Ponderado',
  round_robin: 'Round-robin',
}

async function persistRule(config: {
  rule: 'fixed' | 'random' | 'weighted' | 'round_robin'
  fixedAgentId?: string | null
  weights?: Array<{ agentId: string; weight: number }>
  roundRobinPointer?: number
}): Promise<void> {
  await db.update(assignmentConfig)
    .set({
      rule: config.rule,
      fixedAgentId: config.fixedAgentId ?? null,
      weights: (config.weights ?? []) as unknown as typeof assignmentConfig.$inferInsert.weights,
      roundRobinPointer: config.roundRobinPointer ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(assignmentConfig.id, 1))
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function handleAdminMenu(phone: string, input: string): Promise<void> {
  const normalized = input.trim().toLowerCase()

  // Trigger always resets and shows the main menu
  if (TRIGGERS.has(normalized)) {
    clearStep(phone)
    await sendRuleMenu(phone)
    setStep(phone, 'awaiting_rule')
    return
  }

  const step = getStep(phone)

  if (!step) {
    await sendTextMessage(phone, 'Enviá *menu*, *admin* o */regla* para configurar la asignación de leads.')
    return
  }

  // ── Step: awaiting_rule ──────────────────────────────────────────────────────
  if (step === 'awaiting_rule') {
    switch (input) {
      case 'rule_random':
        await persistRule({ rule: 'random' })
        clearStep(phone)
        await sendTextMessage(phone, `✅ Regla actualizada: *${RULE_LABELS['random']}*`)
        break
      case 'rule_round_robin':
        await persistRule({ rule: 'round_robin', roundRobinPointer: 0 })
        clearStep(phone)
        await sendTextMessage(phone, `✅ Regla actualizada: *${RULE_LABELS['round_robin']}*`)
        break
      case 'rule_fixed':
        await sendAgentListMenu(phone)
        setStep(phone, 'awaiting_fixed_agent')
        break
      case 'rule_weighted':
        await sendWeightedPrompt(phone)
        setStep(phone, 'awaiting_weighted_input')
        break
      default:
        await sendTextMessage(phone, 'Opción no reconocida. Elegí una de la lista o enviá *menu* para reiniciar.')
    }
    return
  }

  // ── Step: awaiting_fixed_agent ───────────────────────────────────────────────
  if (step === 'awaiting_fixed_agent') {
    if (input.startsWith('agent_')) {
      const agentId = input.slice('agent_'.length)
      const agents = await getActiveAgents()
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) {
        await sendTextMessage(phone, 'Agente no encontrado o inactivo. Seleccioná uno de la lista.')
        await sendAgentListMenu(phone)
        return
      }
      await persistRule({ rule: 'fixed', fixedAgentId: agentId })
      clearStep(phone)
      await sendTextMessage(phone, `✅ Regla actualizada: *Todo a un agente* → ${agent.name ?? agentId}`)
    } else {
      await sendTextMessage(phone, 'Seleccioná un agente de la lista o enviá *menu* para reiniciar.')
      await sendAgentListMenu(phone)
    }
    return
  }

  // ── Step: awaiting_weighted_input ────────────────────────────────────────────
  if (step === 'awaiting_weighted_input') {
    const agents = await getActiveAgents()
    const result = parseWeights(input, agents)
    if (!result.valid) {
      await sendTextMessage(phone, `❌ ${result.error}\nIntentá de nuevo:`)
      await sendWeightedPrompt(phone)
    } else {
      await persistRule({ rule: 'weighted', weights: result.weights })
      clearStep(phone)
      const summary = result.weights
        .map((w) => {
          const name = agents.find((a) => a.id === w.agentId)?.name ?? w.agentId
          return `${name}: ${w.weight}%`
        })
        .join(', ')
      await sendTextMessage(phone, `✅ Regla actualizada: *Ponderado* → ${summary}`)
    }
    return
  }
}

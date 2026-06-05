import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
  },
}))

import { db } from '@/db'
import { assignLeadByRule } from '@/lib/assignment'

const mockExecute = vi.mocked(db.execute)

type ConfigRow = {
  rule: 'fixed' | 'random' | 'weighted' | 'round_robin'
  fixed_agent_id: string | null
  weights: Array<{ agentId: string; weight: number }>
  round_robin_pointer: number
}

// Sets up 3 calls: config, eligible agents, optional UPDATE (used by round_robin)
function mockCalls(config: ConfigRow | null, agents: { id: string }[]) {
  mockExecute
    .mockResolvedValueOnce((config ? [config] : []) as never)
    .mockResolvedValueOnce(agents as never)
    .mockResolvedValueOnce([] as never) // UPDATE result, ignored
}

const THREE_AGENTS = [{ id: 'agent-a' }, { id: 'agent-b' }, { id: 'agent-c' }]

const RR_CONFIG: ConfigRow = {
  rule: 'round_robin',
  fixed_agent_id: null,
  weights: [],
  round_robin_pointer: 0,
}

describe('assignLeadByRule', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when no eligible agents', async () => {
    mockCalls(RR_CONFIG, [])
    expect(await assignLeadByRule()).toBeNull()
  })

  it('defaults to round_robin when no config row exists', async () => {
    mockCalls(null, THREE_AGENTS)
    // pointer defaults to 0 → index 0 → agent-a
    expect(await assignLeadByRule()).toBe('agent-a')
  })

  // ─── fixed ────────────────────────────────────────────────────────────────────

  describe('fixed', () => {
    it('returns the fixed agent when it is active', async () => {
      mockCalls(
        { rule: 'fixed', fixed_agent_id: 'agent-b', weights: [], round_robin_pointer: 0 },
        THREE_AGENTS,
      )
      expect(await assignLeadByRule()).toBe('agent-b')
    })

    it('falls back to round_robin when fixed agent is inactive (not in eligible list)', async () => {
      mockCalls(
        { rule: 'fixed', fixed_agent_id: 'inactive-x', weights: [], round_robin_pointer: 1 },
        THREE_AGENTS, // sorted: agent-a, agent-b, agent-c
      )
      // pointer=1 → index 1 → agent-b
      expect(await assignLeadByRule()).toBe('agent-b')
      // 3 calls: config, eligible, UPDATE for round_robin
      expect(mockExecute).toHaveBeenCalledTimes(3)
    })

    it('never assigns an inactive agent in fixed rule', async () => {
      mockCalls(
        { rule: 'fixed', fixed_agent_id: 'gone-agent', weights: [], round_robin_pointer: 0 },
        [{ id: 'active-only' }],
      )
      // fixed agent not eligible → round_robin fallback with pointer=0
      expect(await assignLeadByRule()).toBe('active-only')
    })
  })

  // ─── random ───────────────────────────────────────────────────────────────────

  describe('random', () => {
    const RAND_CONFIG: ConfigRow = {
      rule: 'random',
      fixed_agent_id: null,
      weights: [],
      round_robin_pointer: 0,
    }

    it('selects first agent when rng returns 0', async () => {
      mockCalls(RAND_CONFIG, THREE_AGENTS)
      expect(await assignLeadByRule(() => 0)).toBe('agent-a')
    })

    it('selects last agent when rng returns just below 1', async () => {
      mockCalls(RAND_CONFIG, THREE_AGENTS)
      expect(await assignLeadByRule(() => 0.999)).toBe('agent-c')
    })

    it('respects injected rng deterministically', async () => {
      const cases: [number, string][] = [
        [0.0, 'agent-a'],
        [0.33, 'agent-a'],
        [0.34, 'agent-b'],
        [0.66, 'agent-b'],
        [0.67, 'agent-c'],
        [0.99, 'agent-c'],
      ]
      for (const [rngVal, expected] of cases) {
        vi.resetAllMocks()
        mockCalls(RAND_CONFIG, THREE_AGENTS)
        expect(await assignLeadByRule(() => rngVal)).toBe(expected)
      }
    })

    it('never assigns inactive agents (only active appear in eligible)', async () => {
      mockCalls(RAND_CONFIG, [{ id: 'active-1' }, { id: 'active-2' }])
      // rng=0.5 → Math.floor(0.5 * 2) = 1 → active-2
      expect(await assignLeadByRule(() => 0.5)).toBe('active-2')
    })
  })

  // ─── weighted ─────────────────────────────────────────────────────────────────

  describe('weighted', () => {
    const W_CONFIG: ConfigRow = {
      rule: 'weighted',
      fixed_agent_id: null,
      weights: [
        { agentId: 'agent-a', weight: 80 },
        { agentId: 'agent-b', weight: 20 },
      ],
      round_robin_pointer: 0,
    }

    it('selects agent-a (weight=80) when rng falls in its range', async () => {
      mockCalls(W_CONFIG, [{ id: 'agent-a' }, { id: 'agent-b' }])
      // cursor = 0.5 * 100 = 50; 50 - 80 = -30 ≤ 0 → agent-a
      expect(await assignLeadByRule(() => 0.5)).toBe('agent-a')
    })

    it('selects agent-b (weight=20) when rng exceeds agent-a range', async () => {
      mockCalls(W_CONFIG, [{ id: 'agent-a' }, { id: 'agent-b' }])
      // cursor = 0.85 * 100 = 85; 85 - 80 = 5 > 0; 5 - 20 = -15 ≤ 0 → agent-b
      expect(await assignLeadByRule(() => 0.85)).toBe('agent-b')
    })

    it('ignores inactive agents in weights and renormalizes', async () => {
      // agent-b is inactive (absent from eligible)
      mockCalls(W_CONFIG, [{ id: 'agent-a' }])
      // Only agent-a weight=80 → total=80; any rng → agent-a
      expect(await assignLeadByRule(() => 0.99)).toBe('agent-a')
    })

    it('falls back to random when weights list is empty', async () => {
      mockCalls(
        { rule: 'weighted', fixed_agent_id: null, weights: [], round_robin_pointer: 0 },
        [{ id: 'agent-a' }, { id: 'agent-b' }],
      )
      // rng=0 → Math.floor(0 * 2) = 0 → agent-a
      expect(await assignLeadByRule(() => 0)).toBe('agent-a')
    })

    it('falls back to random when all weight agents are inactive', async () => {
      mockCalls(
        {
          rule: 'weighted',
          fixed_agent_id: null,
          weights: [{ agentId: 'gone-x', weight: 50 }, { agentId: 'gone-y', weight: 50 }],
          round_robin_pointer: 0,
        },
        [{ id: 'active-z' }],
      )
      expect(await assignLeadByRule(() => 0)).toBe('active-z')
    })

    it('distributes ~80/20 over 1000 runs within ±8% tolerance', async () => {
      let call = 0
      mockExecute.mockImplementation(() => {
        const even = call++ % 2 === 0
        return Promise.resolve(
          (even
            ? [W_CONFIG]
            : [{ id: 'agent-a' }, { id: 'agent-b' }]) as never,
        )
      })

      const counts: Record<string, number> = { 'agent-a': 0, 'agent-b': 0 }
      for (let i = 0; i < 1000; i++) {
        const result = await assignLeadByRule(Math.random)
        counts[result!]++
      }

      expect(counts['agent-a']).toBeGreaterThan(720) // > 72%
      expect(counts['agent-a']).toBeLessThan(880)    // < 88%
      expect(counts['agent-b']).toBeGreaterThan(120) // > 12%
      expect(counts['agent-b']).toBeLessThan(280)    // < 28%
    }, 15_000)
  })

  // ─── round_robin ──────────────────────────────────────────────────────────────

  describe('round_robin', () => {
    it('selects agent at index 0 when pointer=0', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 0 }, THREE_AGENTS)
      expect(await assignLeadByRule()).toBe('agent-a')
    })

    it('selects agent at index 1 when pointer=1', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 1 }, THREE_AGENTS)
      expect(await assignLeadByRule()).toBe('agent-b')
    })

    it('selects agent at index 2 when pointer=2', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 2 }, THREE_AGENTS)
      expect(await assignLeadByRule()).toBe('agent-c')
    })

    it('wraps around when pointer equals n', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 3 }, THREE_AGENTS)
      // 3 % 3 = 0 → agent-a
      expect(await assignLeadByRule()).toBe('agent-a')
    })

    it('calls db.execute to atomically increment pointer', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 0 }, THREE_AGENTS)
      await assignLeadByRule()
      // 3 total calls: SELECT config, SELECT eligible, UPDATE pointer
      expect(mockExecute).toHaveBeenCalledTimes(3)
    })

    it('rotates through all agents sequentially', async () => {
      for (let pointer = 0; pointer < 3; pointer++) {
        vi.resetAllMocks()
        mockCalls({ ...RR_CONFIG, round_robin_pointer: pointer }, THREE_AGENTS)
        const result = await assignLeadByRule()
        expect(result).toBe(THREE_AGENTS[pointer]!.id)
      }
    })

    it('never assigns inactive agents (eligible list excludes them)', async () => {
      mockCalls({ ...RR_CONFIG, round_robin_pointer: 0 }, [{ id: 'only-active' }])
      expect(await assignLeadByRule()).toBe('only-active')
    })
  })
})

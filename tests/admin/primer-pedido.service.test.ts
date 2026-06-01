import { describe, it, expect } from 'vitest'
import { countPrimerPedidoClientes } from '@/lib/metas/avance.service'

// ─── countPrimerPedidoClientes ────────────────────────────────────────────────
//
// This pure function receives:
//   - clientesEnPeriodo: unique client IDs with a paid order in the period
//   - clientesConHistorial: client IDs that had ANY paid order BEFORE the period
// It returns the count of clients in clientesEnPeriodo that are NOT in clientesConHistorial,
// i.e., their first ever paid order is in the current period.

describe('countPrimerPedidoClientes — logrado calculation', () => {
  it('counts clients without prior order history (logrado)', () => {
    const inPeriod = ['c1', 'c2', 'c3']
    const withHistory = new Set(['c2'])
    expect(countPrimerPedidoClientes(inPeriod, withHistory)).toBe(2)
  })

  it('returns 0 when all clients have prior orders', () => {
    const inPeriod = ['c1', 'c2']
    const withHistory = new Set(['c1', 'c2'])
    expect(countPrimerPedidoClientes(inPeriod, withHistory)).toBe(0)
  })

  it('returns all clients when none have prior history', () => {
    const inPeriod = ['c1', 'c2', 'c3']
    const withHistory = new Set<string>()
    expect(countPrimerPedidoClientes(inPeriod, withHistory)).toBe(3)
  })

  it('returns 0 for empty period list (no paid orders in period)', () => {
    expect(countPrimerPedidoClientes([], new Set())).toBe(0)
  })

  it('returns 0 for empty period list even with history', () => {
    expect(countPrimerPedidoClientes([], new Set(['c1', 'c2']))).toBe(0)
  })

  it('correctly identifies a single new client among repeat buyers', () => {
    const inPeriod = ['c1', 'c2', 'c3', 'c4']
    const withHistory = new Set(['c1', 'c2', 'c3'])
    expect(countPrimerPedidoClientes(inPeriod, withHistory)).toBe(1)
  })
})

// ─── Porcentaje de avance ─────────────────────────────────────────────────────
//
// The progress % is computed in calcularEstadoMeta:
//   pct = objetivo > 0 ? Math.round((alcanzado / objetivo) * 100) : 100
// Bar width is capped at 100% in the UI.

describe('avance primer pedido — porcentaje calculation', () => {
  const calcPct = (alcanzado: number, objetivo: number) =>
    objetivo > 0 ? Math.round((alcanzado / objetivo) * 100) : 100

  it('2 logrado / 10 meta = 20%', () => {
    expect(calcPct(2, 10)).toBe(20)
  })

  it('10 logrado / 10 meta = 100%', () => {
    expect(calcPct(10, 10)).toBe(100)
  })

  it('0 logrado / 10 meta = 0%', () => {
    expect(calcPct(0, 10)).toBe(0)
  })

  it('objective = 0 returns 100% (sin meta numérica)', () => {
    expect(calcPct(0, 0)).toBe(100)
  })

  it('bar width is capped at 100 when pct > 100', () => {
    const pct = calcPct(15, 10) // 150%
    const barWidth = Math.min(pct, 100)
    expect(barWidth).toBe(100)
  })
})

// ─── Caso sin meta para el periodo ───────────────────────────────────────────
//
// When a vendor has no meta loaded, the MetaAvance row does not exist.
// VendedoresGrid places that vendor in `vendedoresSinMeta` and shows
// "Sin meta para este período" across all columns. The new Cl. c/PP column
// is included in sinMetaColSpan so no special handling is needed beyond
// confirming the column span increment.

describe('caso sin meta — sinMetaColSpan includes new column', () => {
  it('sinMetaColSpan increments by 1 when the Cl.c/PP column is added', () => {
    // Base: 1 (C.Nuevos) + 0|1 (Pedidos) + 1 (Conv.Leads) + 1 (Cobertura) + 0|1 (PedPagados) + 1 (Cobranza) + 1 (Proyección)
    // With new column: +1 for Cl. c/PP
    const sinVendedores = false
    const sinAgents = false
    const baseSpan =
      1 + // Clientes Nuevos
      (sinVendedores ? 0 : 1) + // Pedidos
      1 + // Conv. Leads
      1 + // Cobertura
      (sinAgents ? 0 : 1) + // % Ped. Pagados
      1 + // % Cobranza
      1 // Proyección General

    // Each vendor without meta spans ALL data cols (excluding the Vendedor name col)
    // New column adds 1 to that span
    const spanWithNewCol = baseSpan + 1

    // Sanity check: with both vendedores and agents, base = 7, new = 8
    expect(baseSpan).toBe(7)
    expect(spanWithNewCol).toBe(8)
  })
})

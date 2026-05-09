import { describe, it, expect } from 'vitest'
import {
  calcularDistribucionFIFO,
  type PedidoPendiente,
} from '@/lib/cuenta-corriente/pago.service'

// ─── calcularDistribucionFIFO ─────────────────────────────────────────────────
// Pure function — no DB mock needed.

describe('calcularDistribucionFIFO', () => {
  const pedidoA: PedidoPendiente = {
    id: 'a',
    fecha: new Date('2024-01-01'),
    saldoPendiente: '1000.00',
  }

  const pedidoB: PedidoPendiente = {
    id: 'b',
    fecha: new Date('2024-01-02'),
    saldoPendiente: '500.00',
  }

  // ── Scenario 1: pago covers pedido A partially, pedido B untouched ──────────

  describe('Scenario 1 — pago parcial sobre el primer pedido', () => {
    it('aplica el monto al pedido más antiguo y deja el resto sin tocar', () => {
      const result = calcularDistribucionFIFO('700.00', [pedidoA, pedidoB])

      expect(result.aplicaciones).toHaveLength(1)
      expect(result.aplicaciones[0]).toEqual({
        pedidoId: 'a',
        montoAplicado: '700.00',
        saldoRestante: '300.00',
        estadoPago: 'parcial',
      })
      expect(result.sobrante).toBe('0.00')
    })

    it('no incluye pedido B en las aplicaciones', () => {
      const result = calcularDistribucionFIFO('700.00', [pedidoA, pedidoB])

      const aplicadosIds = result.aplicaciones.map((a) => a.pedidoId)
      expect(aplicadosIds).not.toContain('b')
    })
  })

  // ── Scenario 2: pago cubre A completamente y B parcialmente ─────────────────

  describe('Scenario 2 — pago que cubre pedido A entero y parte de B', () => {
    it('salda A y aplica el remanente a B', () => {
      const result = calcularDistribucionFIFO('1200.00', [pedidoA, pedidoB])

      expect(result.aplicaciones).toHaveLength(2)

      expect(result.aplicaciones[0]).toEqual({
        pedidoId: 'a',
        montoAplicado: '1000.00',
        saldoRestante: '0.00',
        estadoPago: 'pagado',
      })

      expect(result.aplicaciones[1]).toEqual({
        pedidoId: 'b',
        montoAplicado: '200.00',
        saldoRestante: '300.00',
        estadoPago: 'parcial',
      })

      expect(result.sobrante).toBe('0.00')
    })
  })

  // ── Scenario 3: pago mayor que la deuda total — sobrante ────────────────────

  describe('Scenario 3 — pago excede el saldo de todos los pedidos', () => {
    it('salda el único pedido y retorna el sobrante correcto', () => {
      const result = calcularDistribucionFIFO('1500.00', [pedidoA])

      expect(result.aplicaciones).toHaveLength(1)
      expect(result.aplicaciones[0]).toEqual({
        pedidoId: 'a',
        montoAplicado: '1000.00',
        saldoRestante: '0.00',
        estadoPago: 'pagado',
      })

      expect(result.sobrante).toBe('500.00')
    })
  })

  // ── Edge case: pago exactamente igual al saldo ────────────────────────────

  describe('Edge case — pago exactamente igual al saldo pendiente', () => {
    it('marca estadoPago como pagado y sobrante 0.00', () => {
      const result = calcularDistribucionFIFO('1000.00', [pedidoA])

      expect(result.aplicaciones).toHaveLength(1)
      expect(result.aplicaciones[0]).toEqual({
        pedidoId: 'a',
        montoAplicado: '1000.00',
        saldoRestante: '0.00',
        estadoPago: 'pagado',
      })
      expect(result.sobrante).toBe('0.00')
    })
  })

  // ── Edge case: sin pedidos pendientes ────────────────────────────────────────

  describe('Edge case — lista de pedidos vacía', () => {
    it('retorna aplicaciones vacías y sobrante igual al monto completo', () => {
      const result = calcularDistribucionFIFO('800.00', [])

      expect(result.aplicaciones).toHaveLength(0)
      expect(result.sobrante).toBe('800.00')
    })
  })

  // ── Edge case: ordering FIFO — el array se pasa en orden inverso ────────────

  describe('Edge case — ordenamiento FIFO por fecha (ignorando orden del array)', () => {
    it('aplica primero al pedido con fecha más antigua independientemente del orden en el array', () => {
      // Pass B first (newer) then A (older) — result must still apply to A first
      const result = calcularDistribucionFIFO('700.00', [pedidoB, pedidoA])

      expect(result.aplicaciones[0]!.pedidoId).toBe('a')
      expect(result.aplicaciones[0]!.estadoPago).toBe('parcial')
    })

    it('procesa múltiples pedidos en orden ascendente de fecha', () => {
      const pedidoC: PedidoPendiente = {
        id: 'c',
        fecha: new Date('2024-01-03'),
        saldoPendiente: '200.00',
      }

      // Pass in reverse order: C, B, A
      const result = calcularDistribucionFIFO('1800.00', [pedidoC, pedidoB, pedidoA])

      // Should apply in order: A (1000) → B (500) → C (200) = 1700, sobrante 100
      expect(result.aplicaciones).toHaveLength(3)
      expect(result.aplicaciones[0]!.pedidoId).toBe('a')
      expect(result.aplicaciones[1]!.pedidoId).toBe('b')
      expect(result.aplicaciones[2]!.pedidoId).toBe('c')
      expect(result.sobrante).toBe('100.00')
    })
  })
})

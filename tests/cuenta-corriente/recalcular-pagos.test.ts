import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))

import { recalcularPagosPedido } from '@/lib/cuenta-corriente/pago.service'
import type { Db } from '@/db'

function makeTx(total: string, suma: string) {
  const whereSet = vi.fn().mockResolvedValue(undefined)
  const setFn = vi.fn().mockReturnValue({ where: whereSet })
  const updateFn = vi.fn().mockReturnValue({ set: setFn })

  const whereSelect = vi.fn().mockResolvedValue([{ suma }])
  const fromFn = vi.fn().mockReturnValue({ where: whereSelect })
  const selectFn = vi.fn().mockReturnValue({ from: fromFn })

  const tx = {
    query: { pedidos: { findFirst: vi.fn().mockResolvedValue({ id: 'p1', total }) } },
    select: selectFn,
    update: updateFn,
  } as unknown as Db

  return { tx, setFn }
}

describe('recalcularPagosPedido', () => {
  it('parcial: sum < total → montoPagado=sum, saldoPendiente=total-sum', async () => {
    const { tx, setFn } = makeTx('100.00', '60.00')
    await recalcularPagosPedido(tx, 'p1')
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      montoPagado: '60.00',
      saldoPendiente: '40.00',
      estadoPago: 'parcial',
    }))
  })

  it('pagado: sum >= total → saldoPendiente=0, estadoPago=pagado', async () => {
    const { tx, setFn } = makeTx('100.00', '100.00')
    await recalcularPagosPedido(tx, 'p1')
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      montoPagado: '100.00',
      saldoPendiente: '0.00',
      estadoPago: 'pagado',
    }))
  })

  it('impago: sum=0 → montoPagado=0, saldoPendiente=total', async () => {
    const { tx, setFn } = makeTx('100.00', '0.00')
    await recalcularPagosPedido(tx, 'p1')
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      montoPagado: '0.00',
      saldoPendiente: '100.00',
      estadoPago: 'impago',
    }))
  })

  it('cap: sum > total → montoPagado capped al total, estadoPago=pagado', async () => {
    const { tx, setFn } = makeTx('100.00', '150.00')
    await recalcularPagosPedido(tx, 'p1')
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      montoPagado: '100.00',
      saldoPendiente: '0.00',
      estadoPago: 'pagado',
    }))
  })

  it('no actualiza si el pedido no existe', async () => {
    const whereSet = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereSet })
    const updateFn = vi.fn().mockReturnValue({ set: setFn })
    const tx = {
      query: { pedidos: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      select: vi.fn(),
      update: updateFn,
    } as unknown as Db
    await recalcularPagosPedido(tx, 'missing')
    expect(updateFn).not.toHaveBeenCalled()
  })
})

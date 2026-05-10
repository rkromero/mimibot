import { describe, it, expect } from 'vitest'
import { calcularDistribucionFIFO } from '@/lib/cuenta-corriente/pago.service'

const d = (s: string) => new Date(s)

describe('calcularDistribucionFIFO', () => {
  it('cubre un único pedido exacto', () => {
    const result = calcularDistribucionFIFO('1000.00', [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '1000.00' },
    ])

    expect(result.aplicaciones).toHaveLength(1)
    expect(result.aplicaciones[0]).toMatchObject({
      pedidoId: 'p1',
      montoAplicado: '1000.00',
      saldoRestante: '0.00',
      estadoPago: 'pagado',
    })
    expect(result.sobrante).toBe('0.00')
  })

  it('cubre parcialmente un pedido y deja sobrante cero', () => {
    const result = calcularDistribucionFIFO('300.00', [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '500.00' },
    ])

    expect(result.aplicaciones[0]).toMatchObject({
      pedidoId: 'p1',
      montoAplicado: '300.00',
      saldoRestante: '200.00',
      estadoPago: 'parcial',
    })
    expect(result.sobrante).toBe('0.00')
  })

  it('distribuye FIFO: el pedido más antiguo se cubre primero', () => {
    const result = calcularDistribucionFIFO('700.00', [
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '400.00' },
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '500.00' },
    ])

    expect(result.aplicaciones[0].pedidoId).toBe('p1')
    expect(result.aplicaciones[1].pedidoId).toBe('p2')
    expect(result.aplicaciones[0].montoAplicado).toBe('500.00')
    expect(result.aplicaciones[1].montoAplicado).toBe('200.00')
    expect(result.aplicaciones[1].saldoRestante).toBe('200.00')
    expect(result.sobrante).toBe('0.00')
  })

  it('pago excede todos los pedidos → sobrante correcto', () => {
    const result = calcularDistribucionFIFO('1500.00', [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '300.00' },
      { id: 'p2', fecha: d('2024-01-15'), saldoPendiente: '400.00' },
    ])

    expect(result.aplicaciones).toHaveLength(2)
    expect(result.aplicaciones[0].estadoPago).toBe('pagado')
    expect(result.aplicaciones[1].estadoPago).toBe('pagado')
    expect(result.sobrante).toBe('800.00')
  })

  it('sin pedidos → todo es sobrante', () => {
    const result = calcularDistribucionFIFO('500.00', [])

    expect(result.aplicaciones).toHaveLength(0)
    expect(result.sobrante).toBe('500.00')
  })

  it('pago cero → sin aplicaciones ni sobrante', () => {
    const result = calcularDistribucionFIFO('0.00', [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '200.00' },
    ])

    expect(result.aplicaciones).toHaveLength(0)
    expect(result.sobrante).toBe('0.00')
  })

  it('reverso de FIFO: tres pedidos, pago cubre dos enteros y uno parcial', () => {
    const pedidos = [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '200.00' },
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '350.00' },
      { id: 'p3', fecha: d('2024-03-01'), saldoPendiente: '500.00' },
    ]

    // 600 cubre p1(200) + p2(350) completamente y aplica 50 a p3
    const result = calcularDistribucionFIFO('600.00', pedidos)

    expect(result.aplicaciones).toHaveLength(3)
    expect(result.aplicaciones[0]).toMatchObject({ pedidoId: 'p1', montoAplicado: '200.00', estadoPago: 'pagado' })
    expect(result.aplicaciones[1]).toMatchObject({ pedidoId: 'p2', montoAplicado: '350.00', estadoPago: 'pagado' })
    expect(result.aplicaciones[2]).toMatchObject({ pedidoId: 'p3', montoAplicado: '50.00', saldoRestante: '450.00', estadoPago: 'parcial' })
    expect(result.sobrante).toBe('0.00')
  })

  it('immutabilidad: no modifica el array original', () => {
    const pedidosOriginales = [
      { id: 'p1', fecha: d('2024-01-01'), saldoPendiente: '500.00' },
      { id: 'p2', fecha: d('2024-02-01'), saldoPendiente: '300.00' },
    ]
    const copia = pedidosOriginales.map(p => ({ ...p }))

    calcularDistribucionFIFO('400.00', pedidosOriginales)

    expect(pedidosOriginales).toEqual(copia)
  })
})

/**
 * Tildes de enviado / entregado / leído a partir de los `statuses` del webhook de Meta.
 */
import { describe, it, expect } from 'vitest'
import { estadoMasAvanzado, tildeDe } from '@/lib/whatsapp/estado-mensaje'

describe('estadoMasAvanzado', () => {
  it('avanza en orden sent → delivered → read', () => {
    expect(estadoMasAvanzado(null, 'sent')).toBe('sent')
    expect(estadoMasAvanzado('sent', 'delivered')).toBe('delivered')
    expect(estadoMasAvanzado('delivered', 'read')).toBe('read')
  })

  it('nunca retrocede si Meta manda los avisos desordenados o repetidos', () => {
    expect(estadoMasAvanzado('read', 'delivered')).toBe('read')
    expect(estadoMasAvanzado('delivered', 'sent')).toBe('delivered')
    expect(estadoMasAvanzado('read', 'read')).toBe('read')
  })

  it('failed pisa cualquier estado', () => {
    expect(estadoMasAvanzado('delivered', 'failed')).toBe('failed')
    expect(estadoMasAvanzado(null, 'failed')).toBe('failed')
  })

  it('un estado desconocido se ignora', () => {
    expect(estadoMasAvanzado('delivered', 'warning')).toBe('delivered')
    expect(estadoMasAvanzado(null, 'warning')).toBeNull()
  })
})

describe('tildeDe', () => {
  it('sin wa_message_id todavía no salió: reloj', () => {
    expect(tildeDe({ waMessageId: null, waStatus: null })).toMatchObject({ cantidad: 0, leido: false, fallo: false })
  })

  it('enviado = 1 tilde; entregado = 2; leído = 2 en azul', () => {
    expect(tildeDe({ waMessageId: 'wamid.1', waStatus: null })).toMatchObject({ cantidad: 1, leido: false, label: 'Enviado' })
    expect(tildeDe({ waMessageId: 'wamid.1', waStatus: 'sent' })).toMatchObject({ cantidad: 1, leido: false })
    expect(tildeDe({ waMessageId: 'wamid.1', waStatus: 'delivered' })).toMatchObject({ cantidad: 2, leido: false, label: 'Entregado' })
    expect(tildeDe({ waMessageId: 'wamid.1', waStatus: 'read' })).toMatchObject({ cantidad: 2, leido: true, label: 'Leído' })
  })

  it('fallido muestra el motivo', () => {
    const t = tildeDe({ waMessageId: 'wamid.1', waStatus: 'failed', waError: 'Número no está en WhatsApp' })
    expect(t.fallo).toBe(true)
    expect(t.label).toContain('Número no está en WhatsApp')
  })
})

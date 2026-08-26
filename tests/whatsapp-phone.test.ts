/**
 * Normalización de teléfonos al formato de WhatsApp (+549 + área + número).
 * Los casos vienen de formatos reales encontrados en contactos y clientes.
 */
import { describe, it, expect } from 'vitest'
import { toWhatsappE164, toWhatsappDigits, ultimos10 } from '@/lib/whatsapp/phone'

describe('toWhatsappE164', () => {
  it('agrega el 9 de celular a los +54 que no lo tienen (formato viejo del intake)', () => {
    expect(toWhatsappE164('+541141628140')).toBe('+5491141628140')
    expect(toWhatsappE164('541141628140')).toBe('+5491141628140')
  })

  it('deja igual los que ya vienen como los manda WhatsApp', () => {
    expect(toWhatsappE164('+5491141628140')).toBe('+5491141628140')
    expect(toWhatsappE164('5491141628140')).toBe('+5491141628140')
  })

  it('acepta formatos escritos a mano (espacios, guiones, 0 y 15)', () => {
    expect(toWhatsappE164('+54 9 11 5755-7499')).toBe('+5491157557499')
    expect(toWhatsappE164('+54 9 3476 35-9192')).toBe('+5493476359192')
    expect(toWhatsappE164('011 4162-8140')).toBe('+5491141628140')
    expect(toWhatsappE164('011 15 4162 8140')).toBe('+5491141628140')
    expect(toWhatsappE164('0351 15 123 4567')).toBe('+5493511234567')
    expect(toWhatsappE164('11 4162 8140')).toBe('+5491141628140')
    expect(toWhatsappE164('1141628140')).toBe('+5491141628140')
  })

  it('prefijo internacional 00', () => {
    expect(toWhatsappE164('0054 11 4162 8140')).toBe('+5491141628140')
  })

  it('otros países se respetan si vienen con + o 00', () => {
    expect(toWhatsappE164('+598 99 123 456')).toBe('+59899123456')
    expect(toWhatsappE164('0055 11 91234 5678')).toBe('+5511912345678')
  })

  it('sin dígitos devuelve null', () => {
    expect(toWhatsappE164('')).toBeNull()
    expect(toWhatsappE164('   ')).toBeNull()
    expect(toWhatsappE164(null)).toBeNull()
    expect(toWhatsappE164(undefined)).toBeNull()
    expect(toWhatsappE164('sin telefono')).toBeNull()
  })
})

describe('toWhatsappDigits', () => {
  it('es el E.164 sin el +', () => {
    expect(toWhatsappDigits('011 4162-8140')).toBe('5491141628140')
    expect(toWhatsappDigits('')).toBe('')
  })
})

describe('ultimos10', () => {
  it('da lo mismo para todas las formas de escribir el mismo número', () => {
    const formas = ['+5491141628140', '+541141628140', '011 4162-8140', '11 15 4162 8140', '+54 9 11 4162-8140']
    for (const f of formas) expect(ultimos10(f), f).toBe('1141628140')
  })
})

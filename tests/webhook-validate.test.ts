import { describe, it, expect } from 'vitest'
import { verifyWhatsAppSignature } from '@/lib/whatsapp/webhook-validate'
import crypto from 'crypto'

const SECRET = 'test-secret-123'

function makeSignature(body: string, secret: string) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('verifyWhatsAppSignature', () => {
  it('valida una firma correcta', () => {
    const body = JSON.stringify({ entry: [] })
    const sig = makeSignature(body, SECRET)
    expect(verifyWhatsAppSignature(body, sig, SECRET)).toBe(true)
  })

  it('rechaza una firma incorrecta', () => {
    const body = JSON.stringify({ entry: [] })
    expect(verifyWhatsAppSignature(body, 'sha256=invalid', SECRET)).toBe(false)
  })

  it('rechaza cuando la firma es null', () => {
    expect(verifyWhatsAppSignature('body', null, SECRET)).toBe(false)
  })

  it('rechaza cuando el body fue alterado', () => {
    const body = JSON.stringify({ entry: [] })
    const sig = makeSignature(body, SECRET)
    const tamperedBody = JSON.stringify({ entry: [], extra: true })
    expect(verifyWhatsAppSignature(tamperedBody, sig, SECRET)).toBe(false)
  })
})

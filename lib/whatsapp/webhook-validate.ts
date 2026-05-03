import crypto from 'crypto'

export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!signature) return false

  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`

  // timingSafeEqual requiere buffers del mismo largo — paddeamos el más corto
  const a = Buffer.from(expected)
  const b = Buffer.allocUnsafe(a.length)
  Buffer.from(signature).copy(b)

  return a.length === Buffer.from(signature).length && crypto.timingSafeEqual(a, b)
}

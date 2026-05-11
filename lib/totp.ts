import { TOTP, generateSecret, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib'

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
})

export { generateSecret }

export async function generateTotpUri(secret: string, email: string): Promise<string> {
  return totp.toURI({ secret, label: email, issuer: 'Mimi CRM' })
}

export async function verifyTotpCode(code: string, secret: string): Promise<boolean> {
  const result = await totp.verify(code, { secret })
  return result.valid
}

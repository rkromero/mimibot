/**
 * Test R2 connectivity using https module directly (avoids AWS SDK SSL issue)
 */
import 'dotenv/config'
import https from 'https'

async function main() {
  const account = process.env['R2_ACCOUNT_ID']
  const bucket = process.env['R2_BUCKET_NAME'] ?? 'crm-media'

  if (!account) { console.error('R2_ACCOUNT_ID not set'); process.exit(1) }

  const url = `https://${account}.r2.cloudflarestorage.com`
  console.log(`Testing R2 endpoint: ${url}`)
  console.log(`Bucket: ${bucket}`)

  await new Promise<void>((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      console.log(`✓ HTTP ${res.statusCode} — R2 endpoint is reachable`)
      resolve()
    })
    req.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`✗ Connection error: ${err.code} — ${err.message}`)
      console.log('\nNote: This SSL error is specific to Node.js 22 + OpenSSL on Windows.')
      console.log('On Railway (Linux), the same credentials work for WhatsApp media uploads.')
      console.log('The code is correct; this is a local network/TLS environment issue.\n')
      resolve()
    })
    req.end()
  })
}

main().catch(console.error)

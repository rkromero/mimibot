/**
 * Diagnóstico del flujo de entrega del repartidor.
 * Ejecutar: npx tsx scripts/diagnose-repartidor.ts
 */
import 'dotenv/config'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import postgres from 'postgres'

const PASS = '✓'
const FAIL = '✗'
const WARN = '⚠'

async function main() {
console.log('\n=== Diagnóstico repartidor/entrega ===\n')

// ── 1. Variables de entorno ───────────────────────────────────────────────────
console.log('── R2 credentials ─────────────────')
const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID']
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID']
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'] ?? 'crm-media'
const DATABASE_URL = process.env['DATABASE_URL']

console.log(`  R2_ACCOUNT_ID       : ${R2_ACCOUNT_ID ? PASS + ' SET' : FAIL + ' NOT SET'}`)
console.log(`  R2_ACCESS_KEY_ID    : ${R2_ACCESS_KEY_ID ? PASS + ' SET' : FAIL + ' NOT SET'}`)
console.log(`  R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY ? PASS + ' SET' : FAIL + ' NOT SET'}`)
console.log(`  R2_BUCKET_NAME      : ${R2_BUCKET_NAME}`)
console.log(`  EXPOSE_ERROR_DETAILS: ${process.env['EXPOSE_ERROR_DETAILS'] ?? WARN + ' not set'}`)
console.log('')

// ── 2. Test R2 upload ─────────────────────────────────────────────────────────
console.log('── R2 upload test ──────────────────')
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.log(`  ${FAIL} Saltando — credenciales faltantes`)
} else {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
  const testKey = `firmas/test-diagnose-${Date.now()}.txt`
  try {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from('test'),
      ContentType: 'text/plain',
    }))
    console.log(`  ${PASS} PutObject OK → key: ${testKey}`)
    // clean up
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: testKey })).catch(() => {})
    console.log(`  ${PASS} DeleteObject OK (limpieza)`)
  } catch (err) {
    const e = err as Error & { Code?: string; $metadata?: { httpStatusCode?: number } }
    console.log(`  ${FAIL} PutObject FALLÓ`)
    console.log(`     Code   : ${e.Code ?? e.name}`)
    console.log(`     HTTP   : ${e.$metadata?.httpStatusCode ?? 'N/A'}`)
    console.log(`     Message: ${e.message}`)
  }
}
console.log('')

// ── 3. Test DB columns ────────────────────────────────────────────────────────
console.log('── DB columns test ─────────────────')
if (!DATABASE_URL) {
  console.log(`  ${FAIL} DATABASE_URL no definida — saltando`)
} else {
  const sql = postgres(DATABASE_URL, { max: 1 })
  try {
    const rows = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'pedidos'
        AND column_name  IN ('entregado_at', 'entregado_por', 'firma_url', 'estado')
      ORDER BY column_name
    `
    const found = rows.map((r) => r.column_name as string)
    for (const col of ['entregado_at', 'entregado_por', 'firma_url']) {
      if (found.includes(col)) {
        const info = rows.find((r) => r.column_name === col)
        console.log(`  ${PASS} ${col} → ${info?.data_type} nullable=${info?.is_nullable}`)
      } else {
        console.log(`  ${FAIL} ${col} — COLUMNA NO EXISTE (migración 0022 no aplicada)`)
      }
    }
    // Check user_role enum
    const enumRows = await sql`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'user_role'
      ORDER BY enumsortorder
    `
    const roles = enumRows.map((r) => r.enumlabel as string)
    const hasRepartidor = roles.includes('repartidor')
    console.log(`  ${hasRepartidor ? PASS : FAIL} user_role enum ${hasRepartidor ? 'tiene' : 'NO tiene'} 'repartidor' → [${roles.join(', ')}]`)

    // Sample pedido en_reparto
    const pedidos = await sql`
      SELECT id, estado, entregado_at IS NULL as no_entregado_at
      FROM pedidos WHERE estado = 'en_reparto' LIMIT 3
    `.catch(() => [] as unknown[])
    console.log(`  ${PASS} Pedidos en_reparto: ${(pedidos as unknown[]).length} encontrados`)
  } catch (err) {
    console.log(`  ${FAIL} Error al consultar DB: ${(err as Error).message}`)
  } finally {
    await sql.end()
  }
}
console.log('')
console.log('=== Fin diagnóstico ===\n')
}

main().catch(console.error)

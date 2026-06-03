import 'dotenv/config'
import postgres from 'postgres'

async function main() {
  const sql = postgres(process.env['DATABASE_URL']!, { max: 1 })
  try {
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'pedidos'
        AND column_name  IN ('entregado_at','entregado_por','firma_url')
      ORDER BY column_name
    `
    const roles = await sql`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'user_role'
      ORDER BY enumsortorder
    `
    console.log('\n=== Verificación migración 0022 en Railway ===\n')
    console.log('user_role enum:', roles.map(r => r.enumlabel).join(', '))
    console.log('repartidor en enum:', roles.some(r => r.enumlabel === 'repartidor') ? '✓ SÍ' : '✗ NO')
    console.log('\nColumnas en tabla pedidos:')
    for (const c of cols) {
      console.log(`  ${c.column_name}: ${c.data_type} (nullable=${c.is_nullable})`)
    }
    const needed = ['entregado_at','entregado_por','firma_url']
    const found = cols.map(c => c.column_name)
    const missing = needed.filter(c => !found.includes(c))
    console.log(missing.length === 0 ? '\n✓ Todas las columnas 0022 presentes' : `\n✗ Faltan: ${missing.join(', ')}`)
  } finally {
    await sql.end()
  }
}
main().catch(console.error)

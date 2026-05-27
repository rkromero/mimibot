/**
 * Applies only the metas column that the feature needs.
 * This is the targeted subset of 0012_fearless_grandmaster.sql
 * relevant to "% cobertura cartera".
 */
import postgres from 'postgres'

const sql = postgres('postgresql://postgres:DFwoGVwNDIRLIumSXCBVPoDMvsUzZUZJ@tramway.proxy.rlwy.net:58436/railway')

try {
  // Add column if not exists (idempotent)
  await sql`
    ALTER TABLE metas
    ADD COLUMN IF NOT EXISTS pct_clientes_con_pedido_objetivo numeric(5,2) DEFAULT '0' NOT NULL
  `
  console.log('✅ Column pct_clientes_con_pedido_objetivo added (or already existed)')

  // Verify
  const [row] = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'metas' AND column_name = 'pct_clientes_con_pedido_objetivo'
  `
  console.log(`   ${row.column_name} (${row.data_type}, default: ${row.column_default})`)
} catch (e) {
  console.error('Error:', e.message)
} finally {
  await sql.end()
}

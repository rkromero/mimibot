import postgres from 'postgres'

const sql = postgres('postgresql://postgres:DFwoGVwNDIRLIumSXCBVPoDMvsUzZUZJ@tramway.proxy.rlwy.net:58436/railway')

// Check columns in metas table
const cols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'metas'
  ORDER BY ordinal_position
`
console.log('metas columns:')
cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`))

// Check if __drizzle_migrations has entry for fearless_grandmaster
const migRows = await sql`
  SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5
`.catch(() => [])
console.log('\n__drizzle_migrations (last 5):')
migRows.forEach(r => console.log(`  ${r.hash || r.tag || JSON.stringify(r)}`))

await sql.end()

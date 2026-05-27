import postgres from 'postgres'

const sql = postgres('postgresql://postgres:DFwoGVwNDIRLIumSXCBVPoDMvsUzZUZJ@tramway.proxy.rlwy.net:58436/railway')

const now = new Date()
const anio = now.getFullYear()
const mes = now.getMonth() + 1

console.log(`\n=== Smoke Test DB Query ===`)
console.log(`Period: ${anio}-${mes.toString().padStart(2,'0')}\n`)

// Get admin and agent users
const users = await sql`
  SELECT id, name, email, role
  FROM users
  WHERE role IN ('admin', 'agent')
  AND is_active = true
  ORDER BY role, name
  LIMIT 10
`
console.log('Users:')
users.forEach(u => console.log(`  [${u.role}] ${u.name} <${u.email}> (${u.id})`))

await sql.end()

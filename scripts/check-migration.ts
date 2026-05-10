import 'dotenv/config'
import postgres from 'postgres'

const client = postgres(process.env['DATABASE_URL']!, { max: 1 })

async function main() {
  const tables = await client`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `
  console.log('DB tables:', tables.map((r) => r.table_name).join(', '))

  const migrations = await client`
    SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at
  `
  console.log('Migrations count:', migrations.length)

  // Test insert a territory
  try {
    const t = await client`
      INSERT INTO territorios (id, nombre, activo, es_legacy, creado_por, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Test', true, false, null, now(), now())
      RETURNING id, nombre
    `
    console.log('Test insert OK:', t[0])
    await client`DELETE FROM territorios WHERE nombre = 'Test'`
  } catch(e: any) {
    console.log('Test insert ERROR:', e.message)
  }

  await client.end()
}

void main()

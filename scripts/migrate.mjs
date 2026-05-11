import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL no está definida')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client)

console.log('[migrate] Ejecutando migraciones...')
await migrate(db, { migrationsFolder: './db/migrations' })
console.log('[migrate] Migraciones completadas.')

await client.end()

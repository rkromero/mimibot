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

// Garantía extra: columna descuento puede estar ausente si __drizzle_migrations
// la registró como aplicada pero la columna nunca se creó (estado corrupto).
// ADD COLUMN IF NOT EXISTS es idempotente — no falla si ya existe.
await client`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS descuento numeric(5,2) DEFAULT '0' NOT NULL`
console.log('[migrate] Fix: pedidos.descuento OK.')

await client.end()

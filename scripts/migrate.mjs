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

// Garantía extra: columna costo_envio (concepto "Envío" del pedido). Mismo
// motivo que descuento: ADD COLUMN IF NOT EXISTS es idempotente.
await client`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_envio numeric(12,2) DEFAULT '0' NOT NULL`
console.log('[migrate] Fix: pedidos.costo_envio OK.')

// Garantía extra: el valor 'rtv' del enum user_role puede faltar si la migración
// 0043 quedó con un timestamp `when` menor al último aplicado en _journal.json y
// drizzle-kit la saltó (estado corrupto: la marca como aplicada pero el ALTER
// nunca corrió). ADD VALUE IF NOT EXISTS es idempotente y corre en autocommit
// (ALTER TYPE ADD VALUE no admite ir dentro de la misma transacción que lo crea).
await client`ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'rtv'`
console.log('[migrate] Fix: user_role rtv OK.')

// Garantía extra: el valor 'distribucion' del enum user_role (rol de reparto,
// clon de 'repartidor' en esta fase). Mismo motivo que 'rtv': los timestamps
// `when` no-monótonos en _journal.json pueden hacer que drizzle-kit saltee la
// migración 0045. ADD VALUE IF NOT EXISTS es idempotente y corre en autocommit.
await client`ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'distribucion'`
console.log('[migrate] Fix: user_role distribucion OK.')

// Garantía extra: los valores del enum estado_pedido agregados en 0020
// (en_reparto) y 0030 (listo_para_repartir) pueden faltar si la corrupción de
// timestamps `when` en _journal.json hace que drizzle-kit saltee esas migraciones
// (las marca aplicadas pero el ALTER nunca corre). Sin estos valores, los pedidos
// en esos estados muestran la pastilla "Estado" en blanco en el front.
// ADD VALUE IF NOT EXISTS es idempotente y corre en autocommit.
await client`ALTER TYPE "estado_pedido" ADD VALUE IF NOT EXISTS 'en_reparto'`
await client`ALTER TYPE "estado_pedido" ADD VALUE IF NOT EXISTS 'listo_para_repartir'`
console.log('[migrate] Fix: estado_pedido en_reparto/listo_para_repartir OK.')

await client.end()

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as relations from './relations'

const fullSchema = { ...schema, ...relations }

// En build time sin DATABASE_URL, devolvemos un placeholder — las queries fallarán en runtime con error claro
const dbUrl = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/placeholder'

const globalForDb = globalThis as unknown as { dbClient: postgres.Sql | undefined }

const client = globalForDb.dbClient ?? postgres(dbUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

if (process.env['NODE_ENV'] !== 'production') {
  globalForDb.dbClient = client
}

export const db = drizzle(client, { schema: fullSchema })
export type Db = typeof db

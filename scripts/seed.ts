import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'
import * as relations from '../db/relations'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

const { pipelineStages, users, botConfig } = schema

const client = postgres(process.env['DATABASE_URL']!)
const db = drizzle(client, { schema: { ...schema, ...relations } })

const STAGES = [
  { slug: 'nuevo',        name: 'Nuevo',          color: '#3b82f6', position: 0, isDeletable: false, isTerminal: false },
  { slug: 'contactado',   name: 'Contactado',     color: '#f59e0b', position: 1, isDeletable: true,  isTerminal: false },
  { slug: 'calificado',   name: 'Calificado',     color: '#10b981', position: 2, isDeletable: true,  isTerminal: false },
  { slug: 'propuesta',    name: 'Propuesta',      color: '#8b5cf6', position: 3, isDeletable: true,  isTerminal: false },
  { slug: 'cerrado-won',  name: 'Cerrado Ganado', color: '#10b981', position: 4, isDeletable: false, isTerminal: true  },
  { slug: 'cerrado-lost', name: 'Cerrado Perdido', color: '#ef4444', position: 5, isDeletable: false, isTerminal: true  },
]

async function seed() {
  console.log('Seeding pipeline stages...')
  for (const stage of STAGES) {
    const existing = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.slug, stage.slug),
    })
    if (!existing) {
      await db.insert(pipelineStages).values(stage)
      console.log(`  + ${stage.name}`)
    } else {
      console.log(`  ~ exists: ${stage.name}`)
    }
  }

  console.log('Seeding admin user...')
  const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com'
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'changeme123'

  const existingAdmin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) })
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 12)
    await db.insert(users).values({
      name: 'Admin',
      email: adminEmail,
      passwordHash: hash,
      role: 'admin',
      avatarColor: '#3b82f6',
      isActive: true,
    })
    console.log(`  + ${adminEmail}`)
  } else {
    console.log(`  ~ exists: ${adminEmail}`)
  }

  console.log('Seeding bot config...')
  const existingBot = await db.query.botConfig.findFirst()
  if (!existingBot) {
    await db.insert(botConfig).values({
      id: 1,
      systemPrompt: `Eres un asistente de ventas amable y profesional. Tu objetivo es calificar al lead preguntando sobre su necesidad, presupuesto y urgencia. Cuando tengas suficiente información para pasar el lead a un agente humano, responde con [HANDOFF].`,
      maxTurns: 5,
      handoffPhrases: ['hablar con humano', 'agente', 'persona real'],
      isEnabled: true,
    })
    console.log('  + bot config')
  } else {
    console.log('  ~ bot config exists')
  }

  console.log('Done.')
  await client.end()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})

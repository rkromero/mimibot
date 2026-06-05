import { auth } from '@/lib/auth'
import { db } from '@/db'
import { assignmentConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import AssignmentConfigForm from './AssignmentConfigForm'

export default async function AssignmentSettingsPage() {
  const [config, agents] = await Promise.all([
    db.query.assignmentConfig.findFirst({ where: eq(assignmentConfig.id, 1) }),
    db.query.users.findMany({
      where: (u, { and, inArray, eq: sqlEq }) =>
        and(inArray(u.role, ['agent', 'vendedor']), sqlEq(u.isActive, true)),
      columns: { id: true, name: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
  ])

  const initialConfig = config
    ? {
        rule: config.rule,
        fixedAgentId: config.fixedAgentId ?? null,
        weights: (config.weights as Array<{ agentId: string; weight: number }>) ?? [],
      }
    : null

  return <AssignmentConfigForm initialConfig={initialConfig} agents={agents} />
}

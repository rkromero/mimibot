import NextAuth from 'next-auth'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import Credentials from 'next-auth/providers/credentials'
import Resend from 'next-auth/providers/resend'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, accounts, sessions, verificationTokens } from '@/db/schema'
import { loginSchema } from '@/lib/validations/auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        // Select only stable columns to avoid failures if new migration hasn't run
        const user = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            isActive: users.isActive,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1)
          .then((r) => r[0])

        if (!user?.passwordHash || !user.isActive) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        // Try to read totpEnabled — column may not exist if migration hasn't run yet
        let totpPending = false
        try {
          const totp = await db
            .select({ totpEnabled: users.totpEnabled })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1)
            .then((r) => r[0])
          totpPending = totp?.totpEnabled === true
        } catch {
          // Migration not run yet — treat as 2FA disabled
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          totpPending,
        }
      },
    }),
    // Magic link — solo activo si RESEND_API_KEY está configurado
    ...(process.env['RESEND_API_KEY']
      ? [
          Resend({
            apiKey: process.env['RESEND_API_KEY'],
            from: process.env['EMAIL_FROM'] ?? 'no-reply@example.com',
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
        token.totpPending = (user as { totpPending?: boolean }).totpPending ?? false
      }
      // Client called useSession().update({ totpVerified: true }) after TOTP check passed
      if (trigger === 'update' && (session as { totpVerified?: boolean } | null)?.totpVerified) {
        token.totpPending = false
      }
      return token
    },
    async session({ session, token }) {
      let dbUser: { role: 'admin' | 'gerente' | 'agent'; isActive: boolean; avatarColor: string } | undefined
      try {
        dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.sub!),
          columns: { role: true, isActive: true, avatarColor: true },
        }) ?? undefined
      } catch {
        // DB unavailable — return session with defaults so the app doesn't hard-crash
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub!,
          role: dbUser?.role ?? ((token.role as 'admin' | 'gerente' | 'agent' | undefined) ?? 'agent'),
          avatarColor: dbUser?.avatarColor ?? '#1d4ed8',
          totpPending: (token.totpPending as boolean | undefined) ?? false,
        },
      }
    },
  },
})

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: 'admin' | 'gerente' | 'agent'
      avatarColor: string
      totpPending?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    totpPending?: boolean
  }
}

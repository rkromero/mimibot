'use client'

import { useState, useTransition } from 'react'
import { cn, relativeTime, stringToColor } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import type { User } from '@/types/db'

type TeamUser = Pick<User, 'id' | 'name' | 'email' | 'role' | 'avatarColor' | 'isActive' | 'isOnline' | 'lastSeenAt'>

type Props = { initialUsers: TeamUser[] }

type EditForm = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent' | 'gerente' | 'vendedor' | 'fabrica' | 'repartidor'
  password: string
}

export default function TeamManager({ initialUsers }: Props) {
  const [members, setMembers] = useState(initialUsers)
  const [showForm, setShowForm] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'agent' as 'admin' | 'agent' | 'gerente' | 'vendedor' | 'fabrica' | 'repartidor' })

  async function toggleActive(userId: string, current: boolean) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    if (res.ok) {
      setMembers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !current } : u))
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        })

        let data: { data?: TeamUser; error?: string } = {}
        try { data = await res.json() } catch { /* empty or non-JSON body */ }

        if (!res.ok) {
          setError(data.error ?? 'Error al crear usuario')
          return
        }

        if (data.data) {
          setMembers((prev) => [...prev, data.data!])
        }
        setNewUser({ name: '', email: '', password: '', role: 'agent' as const })
        setShowForm(false)
      } catch {
        setError('No se pudo conectar con el servidor. Intentá de nuevo.')
      }
    })
  }

  function openEdit(member: TeamUser) {
    setEditError(null)
    setEditForm({
      id: member.id,
      name: member.name ?? '',
      email: member.email,
      role: (member.role ?? 'agent') as 'admin' | 'agent' | 'gerente' | 'vendedor' | 'fabrica' | 'repartidor',
      password: '',
    })
    setShowForm(false)
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm) return
    setEditError(null)

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
        }
        if (editForm.password.length > 0) {
          payload.password = editForm.password
        }

        const res = await fetch(`/api/users/${editForm.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        let data: { data?: TeamUser; error?: string } = {}
        try { data = await res.json() } catch { /* empty or non-JSON body */ }

        if (!res.ok) {
          setEditError(data.error ?? 'Error al guardar cambios')
          return
        }

        if (data.data) {
          setMembers((prev) => prev.map((u) => u.id === editForm.id ? { ...u, ...data.data } : u))
        }
        setEditForm(null)
      } catch {
        setEditError('No se pudo conectar con el servidor. Intentá de nuevo.')
      }
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-md font-semibold">Equipo</h2>
          <p className="text-sm text-muted-foreground">{members.length} usuarios</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setEditForm(null) }}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-100"
        >
          {showForm ? 'Cancelar' : 'Crear usuario'}
        </button>
      </div>

      {/* Formulario de creación */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 p-4 rounded-md border border-border space-y-3"
        >
          <h3 className="text-sm font-medium">Nuevo usuario</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre</label>
              <input
                required
                value={newUser.name}
                onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                className={inputClass}
                placeholder="Juan García"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                required
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                className={inputClass}
                placeholder="juan@empresa.com"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Contraseña inicial</label>
              <input
                required
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                className={inputClass}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rol</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as 'admin' | 'agent' | 'gerente' | 'vendedor' | 'fabrica' | 'repartidor' }))}
                className={inputClass}
              >
                <option value="agent">Agente</option>
                <option value="vendedor">Vendedor</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
                <option value="fabrica">Fábrica</option>
                <option value="repartidor">Repartidor</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Creando...' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Formulario de edición */}
      {editForm && (
        <form
          onSubmit={handleUpdate}
          className="mb-4 p-4 rounded-md border border-border space-y-3"
        >
          <h3 className="text-sm font-medium">Editar usuario</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre</label>
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm((p) => p ? { ...p, name: e.target.value } : p)}
                className={inputClass}
                placeholder="Juan García"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                required
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => p ? { ...p, email: e.target.value } : p)}
                className={inputClass}
                placeholder="juan@empresa.com"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Contraseña{' '}
                <span className="text-muted-foreground/70 font-normal">(dejar en blanco para mantener la actual)</span>
              </label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((p) => p ? { ...p, password: e.target.value } : p)}
                className={inputClass}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rol</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm((p) => p ? { ...p, role: e.target.value as 'admin' | 'agent' | 'gerente' | 'vendedor' | 'fabrica' | 'repartidor' } : p)}
                className={inputClass}
              >
                <option value="agent">Agente</option>
                <option value="vendedor">Vendedor</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
                <option value="fabrica">Fábrica</option>
                <option value="repartidor">Repartidor</option>
              </select>
            </div>
          </div>
          {editError && <p className="text-xs text-destructive">{editError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => setEditForm(null)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de usuarios */}
      <div className="divide-y divide-border rounded-md border border-border">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            <div className="relative shrink-0">
              <Avatar
                name={member.name ?? member.email}
                color={member.avatarColor}
                size="md"
              />
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                  member.isOnline ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600',
                )}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {member.name ?? 'Sin nombre'}
                </span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  member.role === 'admin'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground',
                )}>
                  {member.role}
                </span>
                {!member.isActive && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                    Inactivo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
              {member.lastSeenAt && (
                <span>{relativeTime(member.lastSeenAt)}</span>
              )}
              <button
                onClick={() => openEdit(member)}
                className="text-xs underline hover:text-foreground transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => toggleActive(member.id, member.isActive)}
                className="text-xs underline hover:text-foreground transition-colors"
              >
                {member.isActive ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

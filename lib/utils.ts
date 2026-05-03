import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Genera un color determinista de una cadena (para avatares)
export function stringToColor(str: string): string {
  const colors = [
    '#1d4ed8', // blue-700
    '#047857', // emerald-700
    '#7c3aed', // violet-700
    '#b45309', // amber-700
    '#be123c', // rose-700
    '#0f766e', // teal-700
    '#6d28d9', // purple-700
    '#c2410c', // orange-700
    '#15803d', // green-700
    '#1e40af', // blue-800
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length] ?? '#1d4ed8'
}

// Initials de un nombre: "Juan Pérez" → "JP"
export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// Fecha relativa en español: "hace 3 minutos", "hace 2 días"
export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days}d`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// Formatea un número de teléfono para mostrar
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  // E.164: +5491123456789 → +54 9 11 2345-6789 (simplificado)
  return phone
}

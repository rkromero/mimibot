/**
 * Cómo se muestra a una persona/empresa en toda la app.
 *
 * Regla: si hay empresa / marca, es lo que identifica ("Panadería La Espiga",
 * y debajo "Ana García"); si no, el nombre de la persona como siempre. Sin
 * DB ni React: sirve en servidor (PDFs, exports, avisos) y en cliente.
 */

export type ConEmpresa = {
  empresa?: string | null
}

export type PersonaConEmpresa = ConEmpresa & {
  nombre: string
  apellido?: string | null
}

export function limpiarEmpresa(empresa: string | null | undefined): string | null {
  const e = (empresa ?? '').replace(/\s+/g, ' ').trim()
  return e ? e : null
}

/** "Nombre Apellido" (sin la empresa). */
export function nombrePersona(c: PersonaConEmpresa): string {
  return [c.nombre, c.apellido].filter((p) => !!p && p.trim()).join(' ').trim()
}

/**
 * Línea principal para listas, cabeceras y notificaciones: la empresa si la
 * hay, si no el nombre de la persona.
 */
export function nombrePrincipal(c: PersonaConEmpresa): string {
  return limpiarEmpresa(c.empresa) ?? nombrePersona(c)
}

/** Línea secundaria: el nombre de la persona cuando arriba va la empresa; null si no aplica. */
export function nombreSecundario(c: PersonaConEmpresa): string | null {
  if (!limpiarEmpresa(c.empresa)) return null
  const persona = nombrePersona(c)
  return persona || null
}

/**
 * Una sola línea con todo: "Panadería La Espiga · Ana García" o solo el
 * nombre. Para textos planos (toasts, títulos de push, CSV, buscadores).
 */
export function nombreCompleto(c: PersonaConEmpresa): string {
  const empresa = limpiarEmpresa(c.empresa)
  const persona = nombrePersona(c)
  if (empresa && persona) return `${empresa} · ${persona}`
  return empresa ?? persona
}

/** Mismo criterio para un contacto de lead ({ name }) con la empresa del lead. */
export function nombreLead(contactName: string | null | undefined, empresa: string | null | undefined): {
  principal: string
  secundario: string | null
  completo: string
} {
  const persona = { nombre: contactName ?? '', apellido: null, empresa }
  return {
    principal: nombrePrincipal(persona),
    secundario: nombreSecundario(persona),
    completo: nombreCompleto(persona),
  }
}

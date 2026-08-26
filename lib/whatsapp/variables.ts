export type TemplateVariable = {
  index: number
  source: string
  sample: string
}

export type TemplateVarCtx = {
  /** Nombre completo del contacto (cliente: nombre + apellido; lead: nombre del contacto) */
  clienteNombre?: string
  vendedorNombre?: string
  empresaNombre?: string
  pedidoNumero?: string
  pedidoTotal?: string
  /** Producto que el lead marcó en el formulario del landing (solo conversaciones de lead) */
  productoInteres?: string
}

/** Orígenes de dato que puede tener una variable de plantilla. */
export const TEMPLATE_VAR_SOURCES = [
  { value: 'cliente_nombre',          label: 'Nombre del cliente (solo el nombre)' },
  { value: 'cliente_nombre_completo', label: 'Nombre y apellido del cliente' },
  { value: 'lead_producto_interes',   label: 'Producto de interés del lead' },
  { value: 'vendedor_nombre',         label: 'Nombre del vendedor' },
  { value: 'empresa_nombre',          label: 'Nombre de la empresa' },
  { value: 'pedido_numero',           label: 'Número de pedido' },
  { value: 'pedido_total',            label: 'Total del pedido' },
  { value: 'texto_fijo',              label: 'Texto fijo' },
] as const

/**
 * Primer nombre de un nombre completo: "Juan Pérez" → "Juan", "María José López" → "María".
 * Si viene vacío devuelve ''.
 */
export function primerNombre(nombreCompleto: string | null | undefined): string {
  return (nombreCompleto ?? '').trim().split(/\s+/)[0] ?? ''
}

/** Convierte el jsonb `variables` guardado en la plantilla al tipo tipado (descarta basura). */
export function toTemplateVariables(raw: unknown): TemplateVariable[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (v): v is TemplateVariable =>
      typeof v === 'object' && v !== null && 'index' in v && 'source' in v && 'sample' in v,
  )
}

/** Toma el valor del contexto, o el sample si el dato no está disponible o vino vacío. */
function oSample(valor: string | undefined, sample: string): string {
  return valor && valor.trim().length > 0 ? valor : sample
}

export function resolveTemplateVariables(
  variables: TemplateVariable[],
  ctx: TemplateVarCtx,
): string[] {
  const sorted = [...variables].sort((a, b) => a.index - b.index)
  return sorted.map((v) => {
    switch (v.source) {
      case 'cliente_nombre':          return oSample(primerNombre(ctx.clienteNombre), v.sample)
      case 'cliente_nombre_completo': return oSample(ctx.clienteNombre, v.sample)
      case 'lead_producto_interes':   return oSample(ctx.productoInteres, v.sample)
      case 'vendedor_nombre':         return oSample(ctx.vendedorNombre, v.sample)
      case 'empresa_nombre':          return oSample(ctx.empresaNombre, v.sample)
      case 'pedido_numero':           return oSample(ctx.pedidoNumero, v.sample)
      case 'pedido_total':            return oSample(ctx.pedidoTotal, v.sample)
      case 'texto_fijo':              return v.sample
      default:                        return v.sample
    }
  })
}

export function applyTemplateValues(text: string, values: string[]): string {
  let result = text
  values.forEach((v, i) => {
    result = result.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v)
  })
  return result
}

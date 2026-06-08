export type TemplateVariable = {
  index: number
  source: string
  sample: string
}

export type TemplateVarCtx = {
  clienteNombre?: string
  vendedorNombre?: string
  empresaNombre?: string
  pedidoNumero?: string
  pedidoTotal?: string
}

export function resolveTemplateVariables(
  variables: TemplateVariable[],
  ctx: TemplateVarCtx,
): string[] {
  const sorted = [...variables].sort((a, b) => a.index - b.index)
  return sorted.map((v) => {
    switch (v.source) {
      case 'cliente_nombre':  return ctx.clienteNombre  ?? v.sample
      case 'vendedor_nombre': return ctx.vendedorNombre ?? v.sample
      case 'empresa_nombre':  return ctx.empresaNombre  ?? v.sample
      case 'pedido_numero':   return ctx.pedidoNumero   ?? v.sample
      case 'pedido_total':    return ctx.pedidoTotal    ?? v.sample
      case 'texto_fijo':      return v.sample
      default:                return v.sample
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

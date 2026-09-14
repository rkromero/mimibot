/**
 * resolverScopeExport — el export de cartera (clientes, pedidos, leads,
 * morosos) respeta el mismo alcance que los listados: ventas sólo lo suyo,
 * gerente sus territorios, admin todo; fábrica y reparto no lo exportan.
 * productos y stock quedan fuera (su alcance es por marca, en el handler).
 */
import { describe, it, expect } from 'vitest'
import { resolverScopeExport, esEntidadExport, ENTIDADES_EXPORT } from '@/lib/authz/export-scope'
import type { SessionContext } from '@/lib/territorios/context'

function ctx(role: SessionContext['role'], extra: Partial<SessionContext> = {}): SessionContext {
  return {
    userId: 'u1',
    role,
    territoriosGestionados: [],
    agentesVisibles: [],
    territoriosActivos: [],
    ...extra,
  }
}

const CARTERA = ['clientes', 'pedidos', 'leads', 'morosos'] as const

describe('esEntidadExport', () => {
  it('acepta sólo las entidades conocidas', () => {
    for (const e of ENTIDADES_EXPORT) expect(esEntidadExport(e)).toBe(true)
    expect(esEntidadExport('usuarios')).toBe(false)
    expect(esEntidadExport('')).toBe(false)
  })
})

describe('resolverScopeExport', () => {
  it('admin: sin restricción en todas las entidades', () => {
    for (const e of ENTIDADES_EXPORT) {
      expect(resolverScopeExport(ctx('admin'), e)).toEqual({ kind: 'ok' })
    }
  })

  it('productos y stock: sin restricción de cartera para ningún rol (filtra marca el handler)', () => {
    for (const role of ['agent', 'vendedor', 'rtv', 'gerente', 'fabrica', 'repartidor', 'distribucion'] as const) {
      expect(resolverScopeExport(ctx(role), 'productos')).toEqual({ kind: 'ok' })
      expect(resolverScopeExport(ctx(role), 'stock')).toEqual({ kind: 'ok' })
    }
  })

  it('fabrica, repartidor y distribucion: denegado para padrón, pedidos, leads y morosos', () => {
    for (const role of ['fabrica', 'repartidor', 'distribucion'] as const) {
      for (const e of CARTERA) {
        expect(resolverScopeExport(ctx(role), e)).toEqual({ kind: 'denegado' })
      }
    }
  })

  it('ventas (agent / vendedor / rtv): condición por cartera propia', () => {
    for (const role of ['agent', 'vendedor', 'rtv'] as const) {
      for (const e of CARTERA) {
        const scope = resolverScopeExport(ctx(role), e)
        expect(scope.kind).toBe('ok')
        if (scope.kind !== 'ok') return
        expect(scope.clienteCond).toBeDefined()
        expect(scope.leadCond).toBeDefined()
      }
    }
  })

  it('gerente con territorios: condición por territorio para clientes/pedidos/morosos', () => {
    const g = ctx('gerente', { territoriosGestionados: ['t1', 't2'], agentesVisibles: ['a1'] })
    for (const e of ['clientes', 'pedidos', 'morosos'] as const) {
      const scope = resolverScopeExport(g, e)
      expect(scope.kind).toBe('ok')
      if (scope.kind !== 'ok') return
      expect(scope.clienteCond).toBeDefined()
      expect(scope.leadCond).toBeUndefined()
    }
  })

  it('gerente con agentes: condición por agentes visibles para leads', () => {
    const g = ctx('gerente', { territoriosGestionados: ['t1'], agentesVisibles: ['a1', 'a2'] })
    const scope = resolverScopeExport(g, 'leads')
    expect(scope.kind).toBe('ok')
    if (scope.kind !== 'ok') return
    expect(scope.leadCond).toBeDefined()
    expect(scope.clienteCond).toBeUndefined()
  })

  it('gerente sin territorios ni agentes: CSV vacío (no todo el padrón)', () => {
    const g = ctx('gerente')
    for (const e of CARTERA) {
      expect(resolverScopeExport(g, e)).toEqual({ kind: 'vacio' })
    }
  })
})

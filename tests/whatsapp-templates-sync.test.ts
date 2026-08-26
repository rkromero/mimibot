import { describe, it, expect } from 'vitest'
import { planTemplateSync, templateKey, type MetaTemplateSummary } from '@/lib/whatsapp/templates'

const meta = (name: string, language: string, status = 'APPROVED', extra?: Partial<MetaTemplateSummary>): MetaTemplateSummary =>
  ({ id: `meta_${name}_${language}`, name, language, status, ...extra })

describe('planTemplateSync', () => {
  it('actualiza las locales que existen en la WABA actual con el dato fresco de Meta', () => {
    const local = [{ id: 'l1', name: 'bienvenida', language: 'es' }]
    const plan = planTemplateSync(local, [meta('bienvenida', 'es', 'REJECTED', { rejected_reason: 'INVALID_FORMAT' })])

    expect(plan.deleteIds).toEqual([])
    expect(plan.updates).toEqual([
      { localId: 'l1', meta: { id: 'meta_bienvenida_es', name: 'bienvenida', language: 'es', status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' } },
    ])
  })

  it('marca para borrar las locales que no existen en la WABA actual (quedaron de otra cuenta)', () => {
    const local = [
      { id: 'l1', name: 'bienvenida', language: 'es' },
      { id: 'l2', name: 'seguimiento', language: 'es' },
      { id: 'l3', name: 'propuesta', language: 'es_AR' },
    ]
    const plan = planTemplateSync(local, [meta('bienvenida', 'es')])

    expect(plan.updates.map((u) => u.localId)).toEqual(['l1'])
    expect(plan.deleteIds).toEqual(['l2', 'l3'])
  })

  it('con una WABA nueva y vacía borra todas las locales', () => {
    const local = [
      { id: 'l1', name: 'bienvenida', language: 'es' },
      { id: 'l2', name: 'seguimiento', language: 'es' },
    ]
    const plan = planTemplateSync(local, [])

    expect(plan.updates).toEqual([])
    expect(plan.deleteIds).toEqual(['l1', 'l2'])
  })

  it('el idioma forma parte de la identidad: mismo nombre en otro idioma no cuenta como existente', () => {
    const local = [{ id: 'l1', name: 'bienvenida', language: 'es_AR' }]
    const plan = planTemplateSync(local, [meta('bienvenida', 'es')])

    expect(plan.updates).toEqual([])
    expect(plan.deleteIds).toEqual(['l1'])
  })

  it('ignora plantillas de Meta que no están cargadas localmente (no las importa)', () => {
    const plan = planTemplateSync([], [meta('bienvenida', 'es'), meta('otra', 'es')])
    expect(plan.updates).toEqual([])
    expect(plan.deleteIds).toEqual([])
  })

  it('templateKey combina nombre e idioma', () => {
    expect(templateKey({ name: 'a', language: 'es' })).toBe('a|es')
  })
})

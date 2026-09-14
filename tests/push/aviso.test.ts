import { describe, it, expect } from 'vitest'
import {
  previewMensaje,
  destinatariosAviso,
  armarPayloadPush,
  tagConversacion,
  urlConversacion,
} from '@/lib/push/aviso'

describe('previewMensaje', () => {
  it('usa el texto del mensaje, normalizando espacios', () => {
    expect(previewMensaje('text', '  Hola,\n  quería  saber precios ')).toBe('Hola, quería saber precios')
  })

  it('recorta textos largos con puntos suspensivos', () => {
    const largo = 'a'.repeat(300)
    const out = previewMensaje('text', largo)
    expect(out.length).toBe(120)
    expect(out.endsWith('…')).toBe(true)
  })

  it('describe los adjuntos por tipo', () => {
    expect(previewMensaje('image', null)).toBe('📷 Foto')
    expect(previewMensaje('audio', null)).toBe('🎤 Nota de voz')
    expect(previewMensaje('document', null)).toBe('📄 Documento')
    expect(previewMensaje('video', null)).toBe('🎬 Video')
  })

  it('cae en "Mensaje nuevo" si es texto vacío o tipo desconocido', () => {
    expect(previewMensaje('text', '   ')).toBe('Mensaje nuevo')
    expect(previewMensaje('reaction', null)).toBe('Mensaje nuevo')
  })
})

describe('destinatariosAviso', () => {
  const equipo = [
    { id: 'admin-1', role: 'admin' as const },
    { id: 'admin-2', role: 'admin' as const },
    { id: 'ger-1', role: 'gerente' as const },
    { id: 'ag-1', role: 'agent' as const },
    { id: 'ag-2', role: 'agent' as const },
    { id: 'fab-1', role: 'fabrica' as const },
  ]

  it('admins reciben todo y el asignado recibe lo suyo', () => {
    expect(destinatariosAviso(equipo, 'ag-1').sort()).toEqual(['admin-1', 'admin-2', 'ag-1'])
  })

  it('sin asignar: admins y gerentes, ningún agente', () => {
    expect(destinatariosAviso(equipo, null).sort()).toEqual(['admin-1', 'admin-2', 'ger-1'])
  })

  it('no repite al admin cuando además es el asignado', () => {
    expect(destinatariosAviso(equipo, 'admin-1').sort()).toEqual(['admin-1', 'admin-2'])
  })

  it('nunca avisa a fábrica ni a reparto', () => {
    expect(destinatariosAviso(equipo, 'fab-1')).not.toContain('fab-1')
  })
})

describe('armarPayloadPush', () => {
  it('arma título, cuerpo, tag por conversación y URL del inbox', () => {
    const p = armarPayloadPush({ conversationId: 'c1', contactName: 'Juan Pérez', preview: 'Hola' })
    expect(p).toEqual({
      title: 'Juan Pérez',
      body: 'Hola',
      tag: tagConversacion('c1'),
      url: urlConversacion('c1'),
      conversationId: 'c1',
    })
    expect(p.tag).toBe('conv-c1')
    expect(p.url).toBe('/inbox?conversation=c1')
  })

  it('sin nombre de contacto usa "Mensaje nuevo"', () => {
    expect(armarPayloadPush({ conversationId: 'c1', contactName: '', preview: 'x' }).title).toBe('Mensaje nuevo')
  })
})

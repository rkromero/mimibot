import { describe, it, expect } from 'vitest'
import {
  limpiarEmpresa,
  nombrePersona,
  nombrePrincipal,
  nombreSecundario,
  nombreCompleto,
  nombreLead,
} from '@/lib/clientes/nombre'

describe('nombre de cliente / lead con empresa', () => {
  const conEmpresa = { nombre: 'Ana', apellido: 'García', empresa: '  Panadería   La Espiga ' }
  const sinEmpresa = { nombre: 'Ana', apellido: 'García', empresa: null }

  it('limpiarEmpresa normaliza espacios y devuelve null si está vacía', () => {
    expect(limpiarEmpresa('  Panadería   La Espiga ')).toBe('Panadería La Espiga')
    expect(limpiarEmpresa('   ')).toBeNull()
    expect(limpiarEmpresa(undefined)).toBeNull()
  })

  it('con empresa: principal es la empresa y secundario la persona', () => {
    expect(nombrePrincipal(conEmpresa)).toBe('Panadería La Espiga')
    expect(nombreSecundario(conEmpresa)).toBe('Ana García')
    expect(nombreCompleto(conEmpresa)).toBe('Panadería La Espiga · Ana García')
  })

  it('sin empresa: se ve como siempre, sin línea secundaria', () => {
    expect(nombrePrincipal(sinEmpresa)).toBe('Ana García')
    expect(nombreSecundario(sinEmpresa)).toBeNull()
    expect(nombreCompleto(sinEmpresa)).toBe('Ana García')
  })

  it('tolera apellido nulo o "-" de los clientes convertidos', () => {
    expect(nombrePersona({ nombre: 'Kiosco Sol', apellido: null })).toBe('Kiosco Sol')
    expect(nombreCompleto({ nombre: 'Ana', apellido: '-', empresa: 'La Espiga' })).toBe('La Espiga · Ana -')
  })

  it('nombreLead arma lo mismo a partir del contacto del lead', () => {
    expect(nombreLead('Ana García', 'La Espiga')).toEqual({
      principal: 'La Espiga',
      secundario: 'Ana García',
      completo: 'La Espiga · Ana García',
    })
    expect(nombreLead('Ana García', null)).toEqual({ principal: 'Ana García', secundario: null, completo: 'Ana García' })
    expect(nombreLead(null, 'La Espiga')).toEqual({ principal: 'La Espiga', secundario: null, completo: 'La Espiga' })
  })
})

/**
 * Tests para /api/respuestas-rapidas y /api/respuestas-rapidas/[id]
 *
 *  1. Sin sesión → 401 en todos los métodos.
 *  2. GET devuelve la lista.
 *  3. POST normaliza el atajo ("/Hola Juan" → "hola-juan"), guarda quién la
 *     creó y devuelve 201.
 *  4. POST con datos inválidos → 400; con atajo repetido → 409.
 *  5. PATCH edita, rechaza atajo de otra respuesta (409) y 404 si no existe.
 *  6. DELETE borra o 404.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuthFn,
  mockFindFirst,
  mockSelectOrderBy,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateReturning,
  mockDeleteWhere,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockFindFirst: vi.fn(),
  mockSelectOrderBy: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockDeleteWhere: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ orderBy: mockSelectOrderBy }) }),
    query: { respuestasRapidas: { findFirst: mockFindFirst } },
    insert: () => ({
      values: (v: unknown) => {
        mockInsertValues(v)
        return { returning: mockInsertReturning }
      },
    }),
    update: () => ({
      set: (v: unknown) => {
        mockUpdateSet(v)
        return { where: () => ({ returning: mockUpdateReturning }) }
      },
    }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}))

vi.mock('@/lib/authz', () => ({
  withAuth: (handler: (u: unknown) => Promise<unknown>, user: unknown) => {
    if (!user) throw new Error('Sesión requerida')
    return handler(user)
  },
}))

const ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTRO_ID = 'aaaaaaaa-0000-0000-0000-000000000002'
const USER_ID = 'dddddddd-0000-0000-0000-000000000001'
const params = Promise.resolve({ id: ID })

function req(method: string, body?: unknown, path = '/api/respuestas-rapidas') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const loadLista = () => import('@/app/api/respuestas-rapidas/route')
const loadItem = () => import('@/app/api/respuestas-rapidas/[id]/route')

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue({ user: { id: USER_ID, role: 'agent', name: 'Agente' } })
})

describe('GET /api/respuestas-rapidas', () => {
  it('sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { GET } = await loadLista()
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('devuelve la lista', async () => {
    const fila = { id: ID, atajo: 'hola', titulo: 'Saludo', body: 'Hola {nombre}' }
    mockSelectOrderBy.mockResolvedValue([fila])
    const { GET } = await loadLista()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [fila] })
  })
})

describe('POST /api/respuestas-rapidas', () => {
  it('sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { POST } = await loadLista()
    const res = await POST(req('POST', { atajo: 'hola', titulo: 'x', body: 'y' }))
    expect(res.status).toBe(401)
  })

  it('normaliza el atajo, guarda quién la creó y devuelve 201', async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const creada = { id: ID, atajo: 'hola-juan', titulo: 'Saludo', body: 'Hola {nombre}' }
    mockInsertReturning.mockResolvedValue([creada])

    const { POST } = await loadLista()
    const res = await POST(req('POST', { atajo: '/Hola Juan', titulo: ' Saludo ', body: 'Hola {nombre}' }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: creada })
    expect(mockInsertValues).toHaveBeenCalledWith({
      atajo: 'hola-juan',
      titulo: 'Saludo',
      body: 'Hola {nombre}',
      createdBy: USER_ID,
    })
  })

  it('datos inválidos → 400 y no inserta', async () => {
    const { POST } = await loadLista()
    const res = await POST(req('POST', { atajo: 'ho la!', titulo: 'x', body: 'y' }))
    expect(res.status).toBe(400)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('atajo repetido → 409', async () => {
    mockFindFirst.mockResolvedValue({ id: OTRO_ID })
    const { POST } = await loadLista()
    const res = await POST(req('POST', { atajo: 'hola', titulo: 'x', body: 'y' }))
    expect(res.status).toBe(409)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('/hola')
    expect(mockInsertValues).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/respuestas-rapidas/[id]', () => {
  it('edita y devuelve la respuesta actualizada', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: ID }).mockResolvedValueOnce(undefined)
    const actualizada = { id: ID, atajo: 'chau', titulo: 'Cierre', body: 'Chau!' }
    mockUpdateReturning.mockResolvedValue([actualizada])

    const { PATCH } = await loadItem()
    const res = await PATCH(req('PATCH', { atajo: '/Chau', titulo: 'Cierre' }, `/api/respuestas-rapidas/${ID}`), { params })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: actualizada })
    const set = mockUpdateSet.mock.calls[0]![0] as Record<string, unknown>
    expect(set).toMatchObject({ atajo: 'chau', titulo: 'Cierre' })
    expect(set['body']).toBeUndefined()
  })

  it('atajo usado por otra respuesta → 409', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: ID }).mockResolvedValueOnce({ id: OTRO_ID })
    const { PATCH } = await loadItem()
    const res = await PATCH(req('PATCH', { atajo: 'hola' }, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(409)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('no existe → 404', async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const { PATCH } = await loadItem()
    const res = await PATCH(req('PATCH', { titulo: 'x' }, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(404)
  })

  it('body vacío → 400', async () => {
    const { PATCH } = await loadItem()
    const res = await PATCH(req('PATCH', {}, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(400)
  })

  it('id inválido → 400', async () => {
    const { PATCH } = await loadItem()
    const res = await PATCH(req('PATCH', { titulo: 'x' }, '/api/respuestas-rapidas/no-uuid'), { params: Promise.resolve({ id: 'no-uuid' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/respuestas-rapidas/[id]', () => {
  it('borra y devuelve ok', async () => {
    mockFindFirst.mockResolvedValue({ id: ID })
    const { DELETE } = await loadItem()
    const res = await DELETE(req('DELETE', undefined, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(200)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('no existe → 404', async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const { DELETE } = await loadItem()
    const res = await DELETE(req('DELETE', undefined, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(404)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)
    const { DELETE } = await loadItem()
    const res = await DELETE(req('DELETE', undefined, `/api/respuestas-rapidas/${ID}`), { params })
    expect(res.status).toBe(401)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de la DB antes de importar el módulo. Las consultas de marcas.ts encadenan
// .from()/.leftJoin()/.where() y luego se await-ean; el chain mock es thenable y
// resuelve al array preconfigurado.
const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))

import {
  getMarcasVisibles,
  assertPuedeVerMarca,
  assertPuedeCargarProductos,
  marcaVisibleFilter,
  veTodasLasMarcas,
} from '@/lib/authz/marcas'
import { AuthzError } from '@/lib/errors'

type Row = Record<string, unknown>

function chain(result: Row[]) {
  const c: Record<string, unknown> = {}
  c['from'] = () => c
  c['leftJoin'] = () => c
  c['where'] = () => c
  c['then'] = (res: (v: Row[]) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return c
}

function user(role: string, id = 'u1') {
  return { id, email: `${id}@t.com`, name: id, role, avatarColor: '#000' } as never
}

const ventas = user('vendedor')
const admin = user('admin', 'a1')
const gerente = user('gerente', 'g1')
const fabrica = user('fabrica', 'f1')
const agent = user('agent', 'ag1')
const rtv = user('rtv', 'rt1')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('veTodasLasMarcas', () => {
  it('roles con alcance global ven todas las marcas', () => {
    expect(veTodasLasMarcas('admin')).toBe(true)
    expect(veTodasLasMarcas('gerente')).toBe(true)
    expect(veTodasLasMarcas('fabrica')).toBe(true)
    expect(veTodasLasMarcas('repartidor')).toBe(true) // TODO: acotar en fase posterior
  })

  it('roles de ventas NO ven todas las marcas', () => {
    expect(veTodasLasMarcas('agent')).toBe(false)
    expect(veTodasLasMarcas('vendedor')).toBe(false)
    expect(veTodasLasMarcas('rtv')).toBe(false)
  })
})

describe('getMarcasVisibles', () => {
  it('admin recibe TODAS las marcas', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'm1' }, { id: 'm2' }]))
    await expect(getMarcasVisibles(admin)).resolves.toEqual(['m1', 'm2'])
  })

  it('gerente recibe TODAS las marcas', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]))
    await expect(getMarcasVisibles(gerente)).resolves.toEqual(['m1', 'm2', 'm3'])
  })

  it('fabrica recibe TODAS las marcas', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'm1' }, { id: 'm2' }]))
    await expect(getMarcasVisibles(fabrica)).resolves.toEqual(['m1', 'm2'])
  })

  it('vendedor recibe default (Mimi) + asignadas', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }, { id: 'mX' }]))
    await expect(getMarcasVisibles(ventas)).resolves.toEqual(['mimi', 'mX'])
  })

  it('agent SIN asignación recibe solo la default (Mimi)', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(getMarcasVisibles(agent)).resolves.toEqual(['mimi'])
  })

  it('agent CON asignación recibe default + asignadas', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }, { id: 'mX' }]))
    await expect(getMarcasVisibles(agent)).resolves.toEqual(['mimi', 'mX'])
  })

  it('rtv SIN asignación recibe solo la default (Mimi)', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(getMarcasVisibles(rtv)).resolves.toEqual(['mimi'])
  })
})

describe('marcaVisibleFilter', () => {
  it('admin/gerente/fabrica → undefined (sin filtro, ven todo) sin tocar la DB', async () => {
    await expect(marcaVisibleFilter(admin)).resolves.toBeUndefined()
    await expect(marcaVisibleFilter(gerente)).resolves.toBeUndefined()
    await expect(marcaVisibleFilter(fabrica)).resolves.toBeUndefined()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('vendedor con marcas visibles → devuelve una condición (filtra)', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }, { id: 'mX' }]))
    const cond = await marcaVisibleFilter(ventas)
    expect(cond).toBeDefined()
  })

  it('vendedor sin ninguna marca visible → condición siempre falsa (no ve nada)', async () => {
    mockSelect.mockReturnValueOnce(chain([]))
    const cond = await marcaVisibleFilter(ventas)
    expect(cond).toBeDefined()
  })
})

describe('assertPuedeVerMarca', () => {
  it('admin no consulta la DB y siempre puede', async () => {
    await expect(assertPuedeVerMarca(admin, 'cualquiera')).resolves.toBeUndefined()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('vendedor puede ver una marca habilitada', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(assertPuedeVerMarca(ventas, 'mimi')).resolves.toBeUndefined()
  })

  it('vendedor NO puede ver una marca no habilitada → AuthzError', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(assertPuedeVerMarca(ventas, 'mZ')).rejects.toThrow(AuthzError)
  })
})

describe('assertPuedeCargarProductos', () => {
  it('admin no consulta la DB y siempre puede cargar', async () => {
    await expect(assertPuedeCargarProductos(admin, ['p1'])).resolves.toBeUndefined()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('lista vacía resuelve sin consultar', async () => {
    await expect(assertPuedeCargarProductos(ventas, [])).resolves.toBeUndefined()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('vendedor puede cargar productos de marcas habilitadas', async () => {
    // 1ª select = productos; 2ª select = marcas visibles
    mockSelect.mockReturnValueOnce(chain([{ id: 'p1', marcaId: 'mimi' }]))
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(assertPuedeCargarProductos(ventas, ['p1'])).resolves.toBeUndefined()
  })

  it('vendedor NO puede cargar un producto de marca no habilitada → AuthzError', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 'p2', marcaId: 'mZ' }]))
    mockSelect.mockReturnValueOnce(chain([{ id: 'mimi' }]))
    await expect(assertPuedeCargarProductos(ventas, ['p2'])).rejects.toThrow(AuthzError)
  })
})

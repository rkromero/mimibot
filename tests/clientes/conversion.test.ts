import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks — must be declared with vi.hoisted so they are available
// when vi.mock factories run (vi.mock is hoisted to top by Vitest). ─────────

const { mockTransaction, mockTxQueryLeadsFindFirst, mockTxQueryClientesFindFirst,
  mockTxQueryTerritorioAgenteFindFirst, mockTxInsert, mockTxUpdate } = vi.hoisted(() => {
  const mockTxQueryLeadsFindFirst = vi.fn()
  const mockTxQueryClientesFindFirst = vi.fn()
  const mockTxQueryTerritorioAgenteFindFirst = vi.fn()
  const mockTxInsert = vi.fn()
  const mockTxUpdate = vi.fn()
  const mockTransaction = vi.fn()
  return {
    mockTransaction,
    mockTxQueryLeadsFindFirst,
    mockTxQueryClientesFindFirst,
    mockTxQueryTerritorioAgenteFindFirst,
    mockTxInsert,
    mockTxUpdate,
  }
})

vi.mock('@/db', () => ({
  db: {
    transaction: mockTransaction,
  },
}))

vi.mock('@/lib/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} not found`)
      this.name = 'NotFoundError'
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ValidationError'
    }
  },
}))

import { convertirLeadACliente, completarClienteDesdeLead } from '@/lib/clientes/conversion'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh tx object whose methods delegate to the hoisted mock fns. */
function makeTx() {
  return {
    query: {
      leads: { findFirst: mockTxQueryLeadsFindFirst },
      clientes: { findFirst: mockTxQueryClientesFindFirst },
      territorioAgente: { findFirst: mockTxQueryTerritorioAgenteFindFirst },
    },
    insert: mockTxInsert,
    update: mockTxUpdate,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('convertirLeadACliente', () => {
  const USER_ID = 'user-abc'
  const LEAD_ID = 'lead-001'

  const fakeLead = {
    id: LEAD_ID,
    isOpen: true,
    assignedTo: 'vendedor-1',
    contact: {
      name: 'Ana García',
      email: 'ana@example.com',
      phone: '+5491199999999',
    },
  }

  const fakeNuevoCliente = {
    id: 'cliente-new',
    nombre: 'Ana',
    apellido: 'García',
    email: 'ana@example.com',
    telefono: '+5491199999999',
    origen: 'convertido_de_lead',
    leadId: LEAD_ID,
    asignadoA: 'vendedor-1',
    creadoPor: USER_ID,
    updatedAt: new Date(),
    createdAt: new Date(),
  }

  const fakeExistingCliente = {
    id: 'cliente-existing',
    nombre: 'Ana',
    apellido: 'García',
    email: 'ana@example.com',
    leadId: null,
    updatedAt: new Date(),
    createdAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: mockTransaction runs the callback with a fresh tx
    mockTransaction.mockImplementation((fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),
    )
    // Default: el agente asignado no tiene territorio (null)
    mockTxQueryTerritorioAgenteFindFirst.mockResolvedValue(null)
  })

  // ── No cliente with same email → create new ──────────────────────────────

  describe('cuando no existe cliente con el mismo email', () => {
    it('crea un nuevo cliente y cierra el lead (isOpen=false)', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      const result = await convertirLeadACliente(LEAD_ID, USER_ID)

      expect(result.wasNew).toBe(true)
      expect(result.cliente.id).toBe('cliente-new')
      expect(mockTxInsert).toHaveBeenCalled()
    })

    it('pone isOpen=false en el lead al cerrar', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const closeCall = setUpdate.mock.calls.find((call) => call[0]?.isOpen === false)
      expect(closeCall).toBeDefined()
    })

    it('asigna creadoPor al userId recibido', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const valuesArg = valuesInsert.mock.calls[0]?.[0] as Record<string, unknown>
      expect(valuesArg).toMatchObject({ creadoPor: USER_ID })
    })
  })

  // ── Cliente with same email exists → link without duplicating ───────────

  describe('cuando ya existe un cliente con el mismo email', () => {
    it('actualiza el cliente existente con leadId (no crea uno nuevo)', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      const result = await convertirLeadACliente(LEAD_ID, USER_ID)

      expect(result.wasNew).toBe(false)
      expect(mockTxInsert).not.toHaveBeenCalled()
    })

    it('linkea el leadId en el cliente existente', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const setArg = setClienteUpdate.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg).toMatchObject({ leadId: LEAD_ID })
    })

    it('sigue cerrando el lead aun cuando el cliente ya existía', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const closeCall = setLeadUpdate.mock.calls.find((call) => call[0]?.isOpen === false)
      expect(closeCall).toBeDefined()
    })
  })

  // ── Error cases ──────────────────────────────────────────────────────────

  describe('errores', () => {
    it('lanza NotFoundError si el lead no existe', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(undefined)

      await expect(convertirLeadACliente(LEAD_ID, USER_ID)).rejects.toThrow('Lead')
    })

    it('lanza NotFoundError si el lead no tiene contacto', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue({ ...fakeLead, contact: null })

      await expect(convertirLeadACliente(LEAD_ID, USER_ID)).rejects.toThrow(
        'Contacto del lead',
      )
    })
  })
})

// ─── Dirección completa y CUIT/DNI del lead → ficha del cliente ──────────────
// Calle, localidad, provincia, código postal y CUIT/DNI cargados en el panel
// del lead viajan al cliente al convertir o al enviar la muestra, sin pisar lo
// que la ficha ya tenga. El CUIT nunca se duplica entre clientes activos.

describe('dirección completa y CUIT/DNI del lead', () => {
  const USER_ID = 'user-abc'
  const LEAD_ID = 'lead-002'
  const CUIT = '20-12345678-9'

  const leadCompleto = {
    id: LEAD_ID,
    isOpen: true,
    assignedTo: null,
    direccion: 'Av. Siempre Viva 742',
    localidad: 'Springfield',
    provincia: 'Buenos Aires',
    codigoPostal: '1900',
    cuit: CUIT,
    contact: { name: 'Homero Simpson', email: 'homero@example.com', phone: '+5491100000000' },
  }

  const clienteVacio = {
    id: 'cliente-existing',
    email: 'homero@example.com',
    direccion: null,
    localidad: null,
    provincia: null,
    codigoPostal: null,
    cuit: null,
    leadId: null,
  }

  function armarInsert() {
    const returningInsert = vi.fn().mockResolvedValue([{ id: 'cliente-new' }])
    const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
    mockTxInsert.mockReturnValue({ values: valuesInsert })
    return valuesInsert
  }

  /** Primer update = cliente (con returning); los siguientes (lead, conversación) no devuelven nada. */
  function armarUpdates() {
    const returningCliente = vi.fn().mockResolvedValue([{ id: 'cliente-existing' }])
    const whereCliente = vi.fn().mockReturnValue({ returning: returningCliente })
    const setCliente = vi.fn().mockReturnValue({ where: whereCliente })
    const whereOtro = vi.fn().mockResolvedValue(undefined)
    const setOtro = vi.fn().mockReturnValue({ where: whereOtro })
    mockTxUpdate.mockReset()
    mockTxUpdate.mockReturnValueOnce({ set: setCliente }).mockReturnValue({ set: setOtro })
    return setCliente
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation((fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()))
    mockTxQueryTerritorioAgenteFindFirst.mockResolvedValue(null)
    mockTxQueryLeadsFindFirst.mockResolvedValue(leadCompleto)
  })

  it('crea el cliente con calle, localidad, provincia, CP y CUIT del lead', async () => {
    mockTxQueryClientesFindFirst.mockResolvedValue(undefined) // ni por email ni por CUIT
    const valuesInsert = armarInsert()
    armarUpdates()

    const r = await convertirLeadACliente(LEAD_ID, USER_ID)

    expect(r.wasNew).toBe(true)
    // Busca por email y por CUIT antes de crear
    expect(mockTxQueryClientesFindFirst).toHaveBeenCalledTimes(2)
    expect(valuesInsert.mock.calls[0]![0]).toMatchObject({
      direccion: 'Av. Siempre Viva 742',
      localidad: 'Springfield',
      provincia: 'Buenos Aires',
      codigoPostal: '1900',
      cuit: CUIT,
    })
  })

  it('al cliente existente (por email) le completa solo lo que le falta', async () => {
    mockTxQueryClientesFindFirst
      .mockResolvedValueOnce({ ...clienteVacio, direccion: 'Ya cargada 123' }) // por email
      .mockResolvedValueOnce(undefined) // por CUIT: nadie lo usa
    const setCliente = armarUpdates()

    const r = await convertirLeadACliente(LEAD_ID, USER_ID)

    expect(r.wasNew).toBe(false)
    expect(mockTxInsert).not.toHaveBeenCalled()
    const set = setCliente.mock.calls[0]![0] as Record<string, unknown>
    expect(set).toMatchObject({
      leadId: LEAD_ID,
      localidad: 'Springfield',
      provincia: 'Buenos Aires',
      codigoPostal: '1900',
      cuit: CUIT,
    })
    expect(set).not.toHaveProperty('direccion') // no pisa la dirección cargada
  })

  it('sin coincidencia por email, vincula el cliente activo que ya tiene ese CUIT', async () => {
    mockTxQueryClientesFindFirst
      .mockResolvedValueOnce(undefined) // por email
      .mockResolvedValueOnce({ ...clienteVacio, id: 'cliente-cuit', email: null, cuit: CUIT }) // por CUIT
    const setCliente = armarUpdates()

    const r = await convertirLeadACliente(LEAD_ID, USER_ID)

    expect(r.wasNew).toBe(false)
    expect(mockTxInsert).not.toHaveBeenCalled()
    const set = setCliente.mock.calls[0]![0] as Record<string, unknown>
    expect(set).toMatchObject({ leadId: LEAD_ID, direccion: 'Av. Siempre Viva 742', provincia: 'Buenos Aires' })
    expect(set).not.toHaveProperty('cuit') // ya lo tenía
  })

  it('no copia el CUIT si otro cliente activo ya lo usa', async () => {
    mockTxQueryClientesFindFirst
      .mockResolvedValueOnce(clienteVacio) // por email: este
      .mockResolvedValueOnce({ ...clienteVacio, id: 'cliente-otro', cuit: CUIT }) // por CUIT: otro
    const setCliente = armarUpdates()

    await convertirLeadACliente(LEAD_ID, USER_ID)

    const set = setCliente.mock.calls[0]![0] as Record<string, unknown>
    expect(set).toMatchObject({ leadId: LEAD_ID, provincia: 'Buenos Aires', codigoPostal: '1900' })
    expect(set).not.toHaveProperty('cuit')
  })

  describe('completarClienteDesdeLead (cliente ya vinculado, p. ej. segunda muestra)', () => {
    it('completa provincia, CP y CUIT que faltaban', async () => {
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined) // nadie usa el CUIT
      const setCliente = armarUpdates()
      const cliente = { ...clienteVacio, direccion: 'Calle 1', localidad: 'Lanús' }

      const r = await completarClienteDesdeLead(makeTx() as never, cliente as never, leadCompleto)

      expect(r).toEqual({ id: 'cliente-existing' })
      const set = setCliente.mock.calls[0]![0] as Record<string, unknown>
      expect(set).toMatchObject({ provincia: 'Buenos Aires', codigoPostal: '1900', cuit: CUIT })
      expect(set).not.toHaveProperty('direccion')
      expect(set).not.toHaveProperty('localidad')
    })

    it('no toca la ficha si no le falta nada', async () => {
      armarUpdates()
      const cliente = {
        ...clienteVacio,
        direccion: 'Calle 1',
        localidad: 'Lanús',
        provincia: 'Buenos Aires',
        codigoPostal: '1824',
        cuit: '27-00000000-1',
      }

      const r = await completarClienteDesdeLead(makeTx() as never, cliente as never, leadCompleto)

      expect(r).toBe(cliente)
      expect(mockTxUpdate).not.toHaveBeenCalled()
      expect(mockTxQueryClientesFindFirst).not.toHaveBeenCalled()
    })
  })
})

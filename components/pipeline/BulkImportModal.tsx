'use client'

import { useState, useRef, useTransition } from 'react'
import { X, Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PipelineStage, User } from '@/types/db'

type Props = {
  stages: PipelineStage[]
  userRole: string
  onClose: () => void
}

type ParsedRow = { name: string; phone: string; email: string; notes: string }

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  // skip header row (index 0)
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      name: cols[0] ?? '',
      phone: cols[1] ?? '',
      email: cols[2] ?? '',
      notes: cols[3] ?? '',
    }
  }).filter((r) => r.name.length > 0)
}

type AgentOption = Pick<User, 'id' | 'name'>

export default function BulkImportModal({ stages, userRole, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const [assignedTo, setAssignedTo] = useState('')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<{ imported: number; errors: Array<{ row: number; error: string }> } | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const { data: agents = [] } = useQuery<AgentOption[]>({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=agent&active=true')
      if (!res.ok) return []
      const json = await res.json() as { data: AgentOption[] }
      return json.data
    },
    staleTime: 60_000,
  })

  function handleFile(file: File) {
    setFileName(file.name)
    setResult(null)
    setApiError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setRows(parseCSV(text))
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleSubmit() {
    if (rows.length === 0 || !stageId) return
    setApiError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stageId,
            assignedTo: assignedTo || null,
            rows: rows.map((r) => ({
              name: r.name,
              phone: r.phone || null,
              email: r.email || null,
              notes: r.notes || null,
            })),
          }),
        })
        const json = await res.json() as { data?: typeof result; error?: string }
        if (!res.ok) { setApiError(json.error ?? 'Error al importar'); return }
        setResult(json.data ?? null)
        void queryClient.invalidateQueries({ queryKey: ['leads'] })
      } catch {
        setApiError('Error de conexión')
      }
    })
  }

  const canSubmit = rows.length > 0 && stageId && !isPending && !result

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Importar leads desde CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">

          {/* Instructions */}
          <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Formato del CSV</p>
            <p>Columnas en orden: <span className="font-mono">nombre, telefono, email, notas</span></p>
            <p className="font-mono bg-background border border-border rounded px-2 py-1 mt-1 select-all">
              nombre,telefono,email,notas<br />
              Juan Pérez,+5491155551234,juan@email.com,Interesado en X<br />
              María García,,maria@email.com,
            </p>
            <p>La primera fila (encabezado) se ignora. Todos los leads se crean con fuente <strong>Manual</strong>.</p>
          </div>

          {/* Upload area */}
          {!result && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                'hover:border-primary hover:bg-muted/30',
                rows.length > 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-border',
              )}
            >
              <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
              {fileName
                ? <p className="text-sm font-medium">{fileName} — <span className="text-green-600">{rows.length} filas</span></p>
                : <p className="text-sm text-muted-foreground">Arrastrá un CSV o hacé click para seleccionar</p>
              }
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !result && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Vista previa ({Math.min(rows.length, 5)} de {rows.length})
              </p>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      {['Nombre', 'Teléfono', 'Email', 'Notas'].map((h) => (
                        <th key={h} className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2.5 py-1.5">{r.name}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{r.phone || '—'}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{r.email || '—'}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[120px]">{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Options */}
          {rows.length > 0 && !result && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Etapa</label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Asignar a (opcional)</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Sin asignar</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 size={18} />
                <span className="text-sm font-medium">{result.imported} leads importados correctamente</span>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 text-xs font-medium">
                    <AlertCircle size={14} />
                    {result.errors.length} filas con error
                  </div>
                  {result.errors.slice(0, 5).map((e) => (
                    <p key={e.row} className="text-xs text-red-600 dark:text-red-300">{e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* API Error */}
          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{apiError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'px-4 py-2 text-sm rounded-md font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isPending ? 'Importando...' : `Importar ${rows.length} lead${rows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/types/db'

type Props = { initialStages: PipelineStage[] }

const COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

export default function StagesManager({ initialStages }: Props) {
  const [stages, setStages] = useState(initialStages)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0]!)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }))

    setStages(reordered)
    await fetch('/api/stages/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: reordered.map((s) => ({ id: s.id, position: s.position })) }),
    })
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/stages/${id}`, { method: 'DELETE' })
    if (res.ok) setStages((prev) => prev.filter((s) => s.id !== id))
    else {
      const data = await res.json() as { error: string }
      alert(data.error)
    }
  }

  async function handleRename(id: string, name: string) {
    await fetch(`/api/stages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))
  }

  async function handleCreate() {
    if (!newName.trim()) return
    const res = await fetch('/api/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    const data = await res.json() as { data: PipelineStage }
    if (res.ok) {
      setStages((prev) => [...prev, data.data])
      setNewName('')
      setNewColor(COLORS[0]!)
      setShowNewForm(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-md font-semibold">Etapas del pipeline</h2>
          <p className="text-sm text-muted-foreground">Arrastrá para reordenar. Las etapas bloqueadas no se pueden eliminar.</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Agregar etapa
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border rounded-md border border-border">
            {stages.map((stage) => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {showNewForm && (
        <div className="mt-3 p-3 rounded-md border border-border flex items-center gap-3">
          <div className="flex gap-1.5 shrink-0">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={cn(
                  'w-4 h-4 rounded-full transition-transform',
                  newColor === c && 'ring-2 ring-offset-1 ring-ring scale-110',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="Nombre de la etapa"
            className={cn(
              'flex-1 px-2 py-1 text-sm rounded border',
              'border-border bg-background text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <button onClick={handleCreate} className="text-primary hover:text-primary/80">
            <Check size={15} />
          </button>
          <button onClick={() => setShowNewForm(false)} className="text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function SortableStageRow({
  stage, onDelete, onRename,
}: {
  stage: PipelineStage
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(stage.name)

  const style = { transform: CSS.Transform.toString(transform), transition }

  function saveEdit() {
    if (name.trim() && name !== stage.name) onRename(stage.id, name.trim())
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 bg-background',
        isDragging && 'opacity-50 shadow-md z-10',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={14} />
      </button>

      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          className={cn(
            'flex-1 px-2 py-0.5 text-sm rounded border border-border bg-background',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      ) : (
        <span className="flex-1 text-sm text-foreground">{stage.name}</span>
      )}

      {stage.isTerminal && (
        <span className="text-xs text-muted-foreground shrink-0">terminal</span>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={13} />
          </button>
        )}
        {stage.isDeletable && (
          <button
            onClick={() => onDelete(stage.id)}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

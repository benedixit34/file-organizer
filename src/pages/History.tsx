import { useCallback, useEffect, useState } from 'react'
import { errText, fmtDateTime, itemStatus, opStatus, PageHeader, plural } from '../components/ui'
import type { Operation } from '../types/file'

export function History() {
  const [ops, setOps] = useState<Operation[] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)

  const load = useCallback(() => window.api.history().then(setOps).catch((e) => setMsg({ bad: true, text: errText(e) })), [])
  useEffect(() => {
    load()
  }, [load])

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })

  async function undo(op: Operation) {
    const n = op.items.filter((i) => i.status === 'done').length
    if (!window.confirm(`Move ${plural(n, 'file')} back to where ${n === 1 ? 'it was' : 'they were'}?`)) return
    setBusy(op.id)
    try {
      const res = await window.api.undo(op.id)
      const bad = res.filter((r) => !r.ok)
      setMsg(
        bad.length
          ? { bad: true, text: `Restored ${res.length - bad.length} of ${res.length}. Not restored: ${bad.map((b) => `${b.filename} (${b.error})`).join('; ')}` }
          : { bad: false, text: `Restored ${plural(res.length, 'file')}.` },
      )
      await load()
    } catch (e) {
      setMsg({ bad: true, text: errText(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="History" />
      {msg && <p className={`${msg.bad ? 'note-bad' : 'note'} mb-4`} role="status">{msg.text}</p>}
      {!ops ? (
        <p className="text-muted">Loading…</p>
      ) : ops.length === 0 ? (
        <p className="text-muted">No organizing yet. Each approved move is recorded here so you can undo it.</p>
      ) : (
        <ul className="space-y-3">
          {ops.map((op) => {
            const undoable = op.items.filter((i) => i.status === 'done').length
            const expanded = open.has(op.id)
            return (
              <li key={op.id} className="panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-medium">Organized {plural(op.items.length, 'file')}</div>
                    <div className="text-muted">{fmtDateTime(op.created_at)}, {opStatus[op.status]}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-small" aria-expanded={expanded} onClick={() => toggle(op.id)}>{expanded ? 'Hide files' : 'Show files'}</button>
                    <button className="btn btn-small" disabled={!undoable || busy !== null} onClick={() => undo(op)}>
                      {busy === op.id ? 'Undoing…' : 'Undo'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <ul className="divide-y divide-line border-t border-line">
                    {op.items.map((i) => (
                      <li key={i.id} className="px-4 py-2.5">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium">{i.filename}</span>
                          <span className={i.status === 'failed' ? 'text-bad' : 'text-muted'}>{itemStatus[i.status]}</span>
                        </div>
                        <div className="break-all text-muted">From {i.original_path}</div>
                        <div className="break-all text-muted">To {i.destination_path}</div>
                        {i.error_message && <div className="text-bad">{i.error_message}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

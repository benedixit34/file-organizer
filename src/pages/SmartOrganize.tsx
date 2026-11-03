import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ScanControls } from '../components/ScanControls'
import { errText, fmtDate, fmtSize, PageHeader, plural, relTo } from '../components/ui'
import type { Scanner } from '../components/useScan'
import type { Category, ExplorerFilter, MoveResult, Page, Proposal } from '../types/file'

interface RowProps {
  row: Proposal
  root: string
  cats: Category[]
  checked: boolean
  onToggle: () => void
  onCategory: (name: string) => void
  onRename: () => void
}

function Row({ row, root, cats, checked, onToggle, onCategory, onRename }: RowProps) {
  const conflict = row.status === 'conflict'
  return (
    <Fragment>
      <tr>
        <td className="w-10">
          <input type="checkbox" checked={checked} disabled={conflict} onChange={onToggle} aria-label={`Move ${row.filename}`} />
        </td>
        <td className="max-w-[260px]">
          <div className="truncate font-medium" title={row.from}>{row.filename}</div>
          <div className="text-muted">{fmtSize(row.size)}</div>
        </td>
        <td>
          <select className="field" aria-label={`Category for ${row.filename}`} value={row.category} onChange={(e) => onCategory(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </td>
        <td className="max-w-[240px]"><div className="truncate" title={row.to}>{relTo(row.to, root)}</div></td>
        <td className="whitespace-nowrap text-right tabular-nums">{Math.round(row.confidence * 100)}%</td>
      </tr>
      {conflict && row.existing && row.renamedTo && (
        <tr>
          <td />
          <td colSpan={4}>
            <div className="note text-[13px]">
              <p>
                A file with this name is already in that folder, so this one is skipped for now.
                Existing: {fmtSize(row.existing.size)}, modified {fmtDate(row.existing.modified_at)}.
                This file: {fmtSize(row.size)}, modified {fmtDate(row.modified_at)}.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <button className="btn btn-small" onClick={onRename}>Keep both as {row.renamedTo.split(/[\\/]/).pop()}</button>
                <span>or pick another category above.</span>
              </p>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2>{title}</h2>
      <p className="mb-2 text-muted">{hint}</p>
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Include</span></th>
              <th scope="col">File</th>
              <th scope="col">Category</th>
              <th scope="col">Destination</th>
              <th scope="col" className="text-right">Confidence</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  )
}

export function SmartOrganize({ scanner, go }: { scanner: Scanner; go: (p: Page, f?: ExplorerFilter) => void }) {
  const [rows, setRows] = useState<Proposal[] | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [root, setRoot] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<MoveResult[] | null>(null)
  const [failed, setFailed] = useState<Proposal[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c, r] = await Promise.all([window.api.preview(), window.api.categories(), window.api.getRoot()])
    setRows(p)
    setCats(c)
    setRoot(r)
    setSelected(new Set(p.filter((x) => x.status === 'ready').map((x) => x.fileId)))
  }, [])
  useEffect(() => {
    load().catch((e) => setError(errText(e)))
  }, [load, scanner.version])

  const replace = (next: Proposal, select: boolean) => {
    setRows((rs) => rs!.map((r) => (r.fileId === next.fileId ? next : r)))
    setSelected((s) => {
      const n = new Set(s)
      if (select) n.add(next.fileId)
      else n.delete(next.fileId)
      return n
    })
  }
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  async function changeCategory(row: Proposal, category: string) {
    try {
      const next = await window.api.retarget(row.fileId, category)
      replace(next, next.status === 'ready')
    } catch (e) {
      setError(errText(e))
    }
  }
  const keepBoth = (row: Proposal) =>
    replace({ ...row, to: row.renamedTo!, status: 'ready', existing: undefined, renamedTo: undefined }, true)

  async function run(items: Proposal[]) {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.organize(items.map((i) => ({ fileId: i.fileId, to: i.to })))
      setResults(res)
      setFailed(items.filter((i) => res.some((r) => r.fileId === i.fileId && !r.ok)))
      await load()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!rows) return error ? <p className="note-bad" role="alert">{error}</p> : <p className="text-muted">Loading…</p>

  const chosen = rows.filter((r) => selected.has(r.fileId) && r.status !== 'conflict')
  const group = (s: Proposal['status']) => rows.filter((r) => r.status === s)
  const ready = group('ready')
  const review = group('review')
  const conflicts = group('conflict')
  const moved = results?.filter((r) => r.ok).length ?? 0
  const bad = results?.filter((r) => !r.ok) ?? []

  const renderRows = (list: Proposal[]) =>
    list.map((r) => (
      <Row
        key={r.fileId} row={r} root={root} cats={cats} checked={selected.has(r.fileId)}
        onToggle={() => toggle(r.fileId)} onCategory={(c) => changeCategory(r, c)} onRename={() => keepBoth(r)}
      />
    ))

  return (
    <>
      <PageHeader title="Smart Organize" sub={rows.length ? `Files move into folders inside ${root}` : undefined}>
        {rows.length > 0 && (
          <>
            <button className="btn" onClick={() => go('dashboard')} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" disabled={!chosen.length || busy} onClick={() => run(chosen)}>
              {busy ? 'Moving…' : `Move ${plural(chosen.length, 'file')}`}
            </button>
          </>
        )}
      </PageHeader>

      {error && <p className="note-bad mb-4" role="alert">{error}</p>}

      {results && (
        <div className="panel mb-6 p-4" role="status">
          {moved > 0 && <p className="font-medium">Moved {plural(moved, 'file')}. You can undo this from History.</p>}
          {bad.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-bad">{plural(bad.length, 'file')} couldn’t be moved and stayed where they were:</p>
              <ul className="mt-1 list-disc pl-5">
                {bad.map((b) => <li key={b.fileId}>{b.filename}: {b.error}</li>)}
              </ul>
              {failed.length > 0 && (
                <button className="btn btn-small mt-2" disabled={busy} onClick={() => run(failed)}>Try these again</button>
              )}
            </div>
          )}
          <button className="btn btn-small mt-3" onClick={() => go('history')}>View history</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel p-6">
          <h2>Nothing to organize</h2>
          <p className="mb-4 mt-1 max-w-prose text-muted">Every scanned file is already in a folder. If new files have arrived, scan again.</p>
          <ScanControls scanner={scanner} label="Scan folder" />
        </div>
      ) : (
        <>
          <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              {plural(ready.length, 'file')} ready
              {review.length > 0 && `, ${review.length} to review`}
              {conflicts.length > 0 && `, ${plural(conflicts.length, 'name conflict')}`}.
            </span>
            <button className="btn btn-small" onClick={() => setSelected(new Set(ready.map((r) => r.fileId)))}>Select all ready</button>
            <button className="btn btn-small" onClick={() => setSelected(new Set())}>Clear selection</button>
          </p>
          {ready.length > 0 && (
            <Section title="Ready to move" hint="High-confidence matches. They’re selected for you; uncheck anything you want to leave alone.">
              {renderRows(ready)}
            </Section>
          )}
          {review.length > 0 && (
            <Section title="Needs your review" hint="Low-confidence matches. Choose a category to include a file, or leave it where it is.">
              {renderRows(review)}
            </Section>
          )}
          {conflicts.length > 0 && (
            <Section title="Name conflicts" hint="A file with the same name already exists in the destination. Nothing is overwritten.">
              {renderRows(conflicts)}
            </Section>
          )}
        </>
      )}
    </>
  )
}

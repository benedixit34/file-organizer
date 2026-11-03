import { useEffect, useState } from 'react'
import { ScanControls } from '../components/ScanControls'
import { fmtDateTime, fmtSize, folderName, hueStyle, opStatus, PageHeader, plural, errText } from '../components/ui'
import type { Scanner } from '../components/useScan'
import type { ExplorerFilter, Page, Stats } from '../types/file'

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="font-display text-2xl font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-muted">{label}</div>
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="px-5 py-4 text-left hover:bg-ground">{inner}</button>
  ) : (
    <div className="px-5 py-4">{inner}</div>
  )
}

export function Dashboard({ scanner, go }: { scanner: Scanner; go: (p: Page, f?: ExplorerFilter) => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [root, setRoot] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([window.api.stats(), window.api.getRoot()])
      .then(([st, r]) => {
        setS(st)
        setRoot(r)
      })
      .catch((e) => setError(errText(e)))
  useEffect(() => {
    load()
  }, [scanner.version])

  async function change() {
    await window.api.chooseRoot()
    load()
  }

  if (error) return <p className="note-bad" role="alert">{error}</p>
  if (!s) return <p className="text-muted">Loading…</p>

  return (
    <>
      <PageHeader title={folderName(root) || 'Folder'} sub={root}>
        <button className="btn" onClick={change} disabled={scanner.running}>Change folder</button>
      </PageHeader>

      {s.lastScan === null ? (
        <div className="panel p-6">
          <h2>Scan this folder to get started</h2>
          <p className="mb-4 mt-1 max-w-prose text-muted">
            Smart File Organizer reads file names, sizes and dates to suggest where each file belongs. Nothing moves until you review and approve it.
          </p>
          <ScanControls scanner={scanner} />
        </div>
      ) : (
        <>
          <div className="panel grid grid-cols-5 divide-x divide-line">
            <Stat label="Files" value={s.total.toLocaleString()} />
            <Stat label="Total size" value={fmtSize(s.totalSize)} />
            <Stat label="Categorized" value={s.categorized.toLocaleString()} />
            <Stat label="Need review" value={s.uncategorized.toLocaleString()} onClick={() => go('files', { category: 'Needs Review' })} />
            <Stat label="Duplicates" value={s.duplicates.toLocaleString()} onClick={() => go('files', { view: 'duplicates' })} />
          </div>

          <div className="mt-5 flex flex-wrap items-start gap-4">
            <button className="btn btn-primary" disabled={!s.toOrganize || scanner.running} onClick={() => go('organize')}>
              Organize {plural(s.toOrganize, 'file')}
            </button>
            <ScanControls scanner={scanner} label="Scan again" primary={false} />
          </div>
          <p className="mt-2 text-muted">Last scanned {fmtDateTime(s.lastScan)}</p>

          <h2 className="mb-3 mt-8">Categories</h2>
          <div className="flex flex-wrap gap-3">
            {s.categories.map((c) => (
              <button key={c.name} className="tab" style={hueStyle(c.name)} onClick={() => go('files', { category: c.name })}>
                <div className="font-medium">{c.name}</div>
                <div className="text-muted">{plural(c.count, 'file')}</div>
              </button>
            ))}
          </div>

          <h2 className="mb-3 mt-8">Recent activity</h2>
          {s.recent.length === 0 ? (
            <p className="text-muted">Nothing organized yet. Approved moves will show up here, and you can undo them.</p>
          ) : (
            <ul className="panel divide-y divide-line overflow-hidden">
              {s.recent.map((o) => (
                <li key={o.id}>
                  <button className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-ground" onClick={() => go('history')}>
                    <span>Organized {plural(o.items.length, 'file')}</span>
                    <span className="text-muted">{opStatus[o.status]}, {fmtDateTime(o.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

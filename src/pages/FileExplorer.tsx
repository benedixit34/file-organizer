import { useEffect, useState } from 'react'
import { dirOf, errText, fmtDate, fmtSize, PageHeader, plural, Tag } from '../components/ui'
import type { Category, DuplicateGroup, ExplorerFilter, FileRow, SearchParams } from '../types/file'

const MB = 1024 * 1024
const SIZES: Record<string, Pick<SearchParams, 'minSize' | 'maxSize'>> = {
  '': {},
  small: { maxSize: MB },
  medium: { minSize: MB, maxSize: 100 * MB },
  large: { minSize: 100 * MB },
}
const DAYS: Record<string, number> = { today: 1, week: 7, month: 30 }

export function FileExplorer({ initial, scanVersion }: { initial: ExplorerFilter; scanVersion: number }) {
  const [view, setView] = useState<'all' | 'duplicates'>(initial.view ?? 'all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(initial.category ?? '')
  const [ext, setExt] = useState('')
  const [size, setSize] = useState('')
  const [age, setAge] = useState('')
  const [cats, setCats] = useState<Category[]>([])
  const [rows, setRows] = useState<FileRow[]>([])
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.categories().then(setCats).catch((e) => setError(errText(e)))
  }, [])

  useEffect(() => {
    if (view !== 'all') return
    const p: SearchParams = {
      query, extension: ext, category: category || undefined, ...SIZES[size],
      modifiedAfter: age ? Date.now() - DAYS[age] * 864e5 : undefined,
    }
    const t = setTimeout(() => window.api.search(p).then(setRows).catch((e) => setError(errText(e))), 200)
    return () => clearTimeout(t)
  }, [view, query, ext, category, size, age, scanVersion])

  useEffect(() => {
    if (view === 'duplicates') window.api.duplicates().then(setGroups).catch((e) => setError(errText(e)))
  }, [view, scanVersion])

  const seg = (v: 'all' | 'duplicates', label: string) => (
    <button
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={`px-4 py-1.5 ${view === v ? 'bg-ink text-white' : 'bg-panel hover:bg-ground'}`}
    >
      {label}
    </button>
  )

  return (
    <>
      <PageHeader title="Files">
        <div className="flex overflow-hidden rounded-md border border-line">
          {seg('all', 'All files')}
          {seg('duplicates', 'Duplicates')}
        </div>
      </PageHeader>
      {error && <p className="note-bad mb-4" role="alert">{error}</p>}

      {view === 'all' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input className="field w-64" type="search" placeholder="Search by file name" aria-label="Search by file name" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <input className="field w-28" placeholder="Extension" aria-label="Extension" value={ext} onChange={(e) => setExt(e.target.value)} />
            <select className="field" aria-label="Size" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Any size</option>
              <option value="small">Under 1 MB</option>
              <option value="medium">1 to 100 MB</option>
              <option value="large">Over 100 MB</option>
            </select>
            <select className="field" aria-label="Modified" value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">Any date</option>
              <option value="today">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted">No files match. If the folder has changed, scan it again from the dashboard.</p>
          ) : (
            <>
              <div className="panel overflow-hidden">
                <table>
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Size</th><th scope="col">Modified</th><th scope="col">Folder</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td className="max-w-[260px] truncate" title={f.filename}>{f.filename}</td>
                        <td><Tag name={f.category} /></td>
                        <td className="whitespace-nowrap tabular-nums">{fmtSize(f.size)}</td>
                        <td className="whitespace-nowrap">{fmtDate(f.modified_at)}</td>
                        <td className="max-w-[240px] truncate text-muted" title={f.current_path}>{dirOf(f.current_path)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 500 && <p className="mt-2 text-muted">Showing the first 500 matches. Narrow the search to see others.</p>}
            </>
          )}
        </>
      ) : groups.length === 0 ? (
        <p className="text-muted">No duplicates found. Files with identical content show up here after a scan.</p>
      ) : (
        <>
          <p className="mb-4 max-w-prose text-muted">
            These files have identical content. Smart File Organizer never deletes anything, so compare the locations and remove extras yourself in File Explorer.
          </p>
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.hash} className="panel overflow-hidden">
                <h2 className="border-b border-line px-4 py-3 text-[15px]">
                  {plural(g.files.length, 'identical file')}, {fmtSize(g.size)} each
                </h2>
                <ul className="divide-y divide-line">
                  {g.files.map((f) => (
                    <li key={f.id} className="px-4 py-2.5">
                      <div className="font-medium">{f.filename}</div>
                      <div className="break-all text-muted">{f.current_path}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}

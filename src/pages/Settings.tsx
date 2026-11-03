import { useEffect, useState, type FormEvent } from 'react'
import { errText, PageHeader, Tag } from '../components/ui'
import type { Category } from '../types/file'

export function Settings() {
  const [root, setRoot] = useState('')
  const [cats, setCats] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [exts, setExts] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([window.api.getRoot(), window.api.categories()])
      .then(([r, c]) => {
        setRoot(r)
        setCats(c)
      })
      .catch((e) => setError(errText(e)))
  useEffect(() => {
    load()
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await window.api.addCategory(name, exts)
      setName('')
      setExts('')
      await load()
    } catch (err) {
      setError(errText(err))
    }
  }
  async function remove(id: number) {
    await window.api.removeCategory(id)
    load()
  }

  const custom = cats.filter((c) => c.is_custom)

  return (
    <>
      <PageHeader title="Settings" />

      <section className="panel mb-6 p-5">
        <h2>Folder to organize</h2>
        <p className="mb-3 mt-1 break-all text-muted">{root}</p>
        <button className="btn" onClick={() => window.api.chooseRoot().then(setRoot)}>Change folder</button>
        <p className="mt-3 max-w-prose text-muted">Changing the folder doesn’t move anything. Scan it from the dashboard to see its files.</p>
      </section>

      <section className="panel p-5">
        <h2>Custom categories</h2>
        <p className="mb-4 mt-1 max-w-prose text-muted">
          Add a category for file types the built-in ones don’t cover. Matching files are suggested for a folder with the category’s name.
        </p>
        {custom.length > 0 && (
          <ul className="mb-4 divide-y divide-line rounded-md border border-line">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="flex items-center gap-3"><Tag name={c.name} /><span className="text-muted">{c.extensions.split(',').join(', ')}</span></span>
                <button className="btn btn-small" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            Category name
            <input className="field w-52" value={name} onChange={(e) => setName(e.target.value)} placeholder="CAD drawings" />
          </label>
          <label className="flex flex-col gap-1">
            File extensions
            <input className="field w-52" value={exts} onChange={(e) => setExts(e.target.value)} placeholder="dwg, skp" />
          </label>
          <button className="btn btn-primary" type="submit">Add category</button>
        </form>
        {error && <p className="note-bad mt-3" role="alert">{error}</p>}
      </section>
    </>
  )
}

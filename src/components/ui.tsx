import type { CSSProperties, ReactNode } from 'react'

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do {
    n /= 1024
    i++
  } while (n >= 1024 && i < units.length - 1)
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtDateTime = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
export const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`
export const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
export const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '')
export const relTo = (p: string, root: string) => (p.toLowerCase().startsWith(root.toLowerCase()) ? p.slice(root.length).replace(/^[\\/]/, '') : p)

/** ipcRenderer.invoke wraps messages as "Error invoking remote method 'x': Error: ..." */
export const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// Each category gets a stable hue, so its tab and tag match everywhere.
export function hue(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
export const hueStyle = (name: string) => ({ '--h': hue(name) }) as CSSProperties

export function Tag({ name }: { name: string | null }) {
  return name ? <span className="tag" style={hueStyle(name)}>{name}</span> : <span className="text-muted">None</span>
}

export function PageHeader({ title, children, sub }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1>{title}</h1>
        {sub && <p className="mt-1 truncate text-muted" title={sub}>{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}

export const opStatus: Record<string, string> = {
  running: 'Interrupted', completed: 'Completed', partial: 'Partly completed', failed: 'Failed', undone: 'Undone',
}
export const itemStatus: Record<string, string> = {
  pending: 'Interrupted', done: 'Moved', failed: 'Failed', undone: 'Restored',
}

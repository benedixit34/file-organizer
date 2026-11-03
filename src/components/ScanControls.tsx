import { plural } from './ui'
import type { Scanner } from './useScan'

export function ScanControls({ scanner, label = 'Scan folder', primary = true }: { scanner: Scanner; label?: string; primary?: boolean }) {
  const { running, progress, error, last } = scanner
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const text = !progress
    ? 'Starting…'
    : progress.phase === 'reading'
      ? `Reading files: ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`
      : `Checking for duplicates: ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`

  return (
    <div>
      <div className="flex items-center gap-3">
        {running ? (
          <button className="btn" onClick={scanner.cancel}>Cancel scan</button>
        ) : (
          <button className={primary ? 'btn btn-primary' : 'btn'} onClick={scanner.run}>{label}</button>
        )}
        {running && <span role="status" className="text-muted">{text}</span>}
      </div>
      {running && (
        <div className="mt-2 h-1.5 w-80 max-w-full overflow-hidden rounded bg-line" aria-hidden>
          <div className="h-full bg-go transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="note-bad mt-3" role="alert">{error}</p>}
      {!running && last && (
        <div className="mt-3 text-muted" role="status">
          <p>
            {last.cancelled ? 'Scan cancelled. ' : ''}
            Read {plural(last.scanned, 'file')}.
            {last.skipped > 0 && ` ${plural(last.skipped, 'file')} still downloading or incomplete will be picked up next time.`}
          </p>
          {last.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">{plural(last.errors.length, 'file')} couldn’t be read</summary>
              <ul className="mt-1 list-disc pl-5">
                {last.errors.slice(0, 20).map((e) => (
                  <li key={e.path} className="break-all">{e.path}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

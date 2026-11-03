import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { all, run, tx, type Db } from '../database/db.ts'
import type { FileRecord, ScanProgress, ScanResult } from '../types/file.ts'
import { friendly } from './errors.ts'

// Browsers write these while a download is still running.
const PARTIAL = new Set(['crdownload', 'part', 'tmp', 'download', 'opdownload'])
// A file touched this recently may still be downloading; leave it for the next scan.
const STABLE_MS = 5000
const CHUNK = 64

interface Found {
  name: string
  path: string
  ext: string
  size: number
  created: number
  modified: number
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

/** Reads metadata for the files directly inside `root` and updates the index. Never modifies files. */
export async function scan(
  db: Db,
  root: string,
  onProgress: (p: ScanProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<ScanResult> {
  const result: ScanResult = { scanned: 0, skipped: 0, errors: [], cancelled: false }

  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name)
  } catch (e) {
    throw new Error(`Can’t open ${root}. ${friendly(e)}`)
  }

  const found: Found[] = []
  for (let i = 0; i < names.length; i += CHUNK) {
    if (signal?.aborted) return { ...result, cancelled: true }
    await Promise.all(
      names.slice(i, i + CHUNK).map(async (name) => {
        const path = join(root, name)
        const ext = extname(name).slice(1).toLowerCase()
        try {
          const s = await stat(path)
          if (PARTIAL.has(ext) || Date.now() - s.mtimeMs < STABLE_MS) {
            result.skipped++
            return
          }
          found.push({ name, path, ext, size: s.size, created: Math.round(s.birthtimeMs), modified: Math.round(s.mtimeMs) })
        } catch (e) {
          result.errors.push({ path, error: friendly(e) })
        }
      }),
    )
    onProgress({ phase: 'reading', done: Math.min(i + CHUNK, names.length), total: names.length })
  }

  // Upsert. A hash is only kept if the file has not changed since it was computed.
  const known = new Map(all<FileRecord>(db, 'SELECT * FROM files').map((r) => [r.current_path, r]))
  const now = Date.now()
  tx(db, () => {
    const up = db.prepare(`
      INSERT INTO files (filename, original_path, current_path, extension, size, created_at, modified_at, hash, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(current_path) DO UPDATE SET filename = excluded.filename, extension = excluded.extension,
        size = excluded.size, created_at = excluded.created_at, modified_at = excluded.modified_at,
        hash = excluded.hash, last_scanned_at = excluded.last_scanned_at`)
    for (const f of found) {
      const old = known.get(f.path)
      const unchanged = old && old.size === f.size && old.modified_at === f.modified
      up.run(f.name, f.path, f.path, f.ext, f.size, f.created, f.modified, unchanged ? old.hash : null, now)
    }
  })

  // Forget files that no longer exist (deleted or moved outside the app).
  const rows = all<{ id: number; current_path: string }>(db, 'SELECT id, current_path FROM files')
  const gone: number[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(
      rows.slice(i, i + CHUNK).map((r) =>
        access(r.current_path).catch(() => {
          gone.push(r.id)
        }),
      ),
    )
  }
  tx(db, () => gone.forEach((id) => run(db, 'DELETE FROM files WHERE id = ?', id)))

  // Only files that share a size with another file can be duplicates, so only those get hashed.
  const toHash = all<FileRecord>(
    db,
    'SELECT * FROM files WHERE hash IS NULL AND size > 0 AND size IN (SELECT size FROM files GROUP BY size HAVING COUNT(*) > 1)',
  )
  for (const [i, r] of toHash.entries()) {
    if (signal?.aborted) {
      result.cancelled = true
      break
    }
    try {
      run(db, 'UPDATE files SET hash = ? WHERE id = ?', await hashFile(r.current_path), r.id)
    } catch (e) {
      result.errors.push({ path: r.current_path, error: friendly(e) })
    }
    onProgress({ phase: 'hashing', done: i + 1, total: toHash.length })
  }

  result.scanned = found.length
  return result
}

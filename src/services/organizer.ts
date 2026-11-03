import { existsSync, statSync } from 'node:fs'
import { link, mkdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { all, one, run, tx, type Db } from '../database/db.ts'
import type {
  Category, DuplicateGroup, FileRecord, FileRow, MoveRequest, MoveResult, Operation, OperationItem,
  Proposal, SearchParams, Stats,
} from '../types/file.ts'
import { classify, REVIEW_THRESHOLD, type CustomRule } from './classifier.ts'
import { friendly } from './errors.ts'
import { getSetting } from '../database/db.ts'

// ---------- categories ----------

export const getCategories = (db: Db) => all<Category>(db, 'SELECT * FROM categories ORDER BY id')

const customRules = (db: Db): CustomRule[] =>
  getCategories(db)
    .filter((c) => c.is_custom)
    .map((c) => ({ name: c.name, extensions: c.extensions.split(',').filter(Boolean) }))

export function addCategory(db: Db, name: string, extensions: string) {
  name = name.trim()
  if (!name) throw new Error('Enter a name for the category.')
  if (/[\\/:*?"<>|]/.test(name) || name.endsWith('.')) {
    throw new Error('Category names can’t contain \\ / : * ? " < > | or end with a period.')
  }
  const exts = [...new Set(extensions.toLowerCase().split(/[\s,]+/).map((e) => e.replace(/^\./, '')).filter(Boolean))]
  if (!exts.length) throw new Error('Add at least one file extension, such as dwg or skp.')
  if (one(db, 'SELECT id FROM categories WHERE name = ?', name)) throw new Error(`A category named “${name}” already exists.`)
  run(db, 'INSERT INTO categories (name, destination_path, is_custom, created_at, extensions) VALUES (?, ?, 1, ?, ?)', name, name, Date.now(), exts.join(','))
  classifyAll(db)
}

export function removeCategory(db: Db, id: number) {
  run(db, 'DELETE FROM categories WHERE id = ? AND is_custom = 1', id)
  classifyAll(db)
}

/** Stores the current classification of every indexed file. */
export function classifyAll(db: Db) {
  const customs = customRules(db)
  const ids = new Map(getCategories(db).map((c) => [c.name, c.id]))
  tx(db, () => {
    const up = db.prepare('UPDATE files SET category_id = ?, confidence_score = ? WHERE id = ?')
    for (const f of all<FileRecord>(db, 'SELECT id, filename FROM files')) {
      const c = classify(f.filename, customs)
      up.run(ids.get(c.category) ?? null, c.confidence, f.id)
    }
  })
}

// ---------- preview ----------

// Windows paths are case-insensitive; comparing lowercase is good enough for "same folder".
const sameDir = (file: string, root: string) => dirname(file).toLowerCase() === resolve(root).toLowerCase()

function isInside(base: string, p: string) {
  const r = relative(resolve(base), resolve(p))
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}

function uniqueName(dir: string, name: string) {
  const ext = extname(name)
  const stem = basename(name, ext)
  for (let n = 1; ; n++) {
    const p = join(dir, `${stem} (${n})${ext}`)
    if (!existsSync(p)) return p
  }
}

function makeProposal(f: FileRecord, category: string, subfolder: string | null, confidence: number, base: string): Proposal {
  const dir = join(base, category, subfolder ?? '')
  const to = join(dir, f.filename)
  const p: Proposal = {
    fileId: f.id, filename: f.filename, size: f.size, modified_at: f.modified_at,
    from: f.current_path, to, category, confidence,
    status: confidence < REVIEW_THRESHOLD ? 'review' : 'ready',
  }
  if (existsSync(to)) {
    const s = statSync(to)
    p.status = 'conflict'
    p.existing = { size: s.size, modified_at: Math.round(s.mtimeMs) }
    p.renamedTo = uniqueName(dir, f.filename)
  }
  return p
}

/** Proposed moves for the files still sitting directly in `root`. Touches nothing. */
export function preview(db: Db, root: string): Proposal[] {
  const customs = customRules(db)
  return all<FileRecord>(db, 'SELECT * FROM files ORDER BY filename COLLATE NOCASE')
    .filter((f) => sameDir(f.current_path, root))
    .map((f) => {
      const c = classify(f.filename, customs)
      return makeProposal(f, c.category, c.subfolder, c.confidence, root)
    })
}

/** The user picked a different category for one file. */
export function retarget(db: Db, root: string, fileId: number, category: string): Proposal {
  const f = one<FileRecord>(db, 'SELECT * FROM files WHERE id = ?', fileId)
  if (!f) throw new Error('This file is no longer in the index. Scan again.')
  const cat = one<Category>(db, 'SELECT * FROM categories WHERE name = ?', category)
  if (!cat) throw new Error(`There is no category named “${category}”.`)
  return makeProposal(f, cat.name, null, 1, root)
}

// ---------- moving ----------

/** Moves a file without ever replacing an existing one. A hard link fails if the target exists, so it is race-free. */
export async function safeMove(from: string, to: string) {
  try {
    await link(from, to)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EEXIST' || code === 'ENOENT') throw e
    // shortcut: drives without hard links (e.g. exFAT) fall back to check-then-rename, which has a tiny race.
    if (existsSync(to)) throw Object.assign(new Error('exists'), { code: 'EEXIST' })
    return rename(from, to)
  }
  try {
    await unlink(from)
  } catch (e) {
    await unlink(to).catch(() => {}) // could not remove the original: undo the copy so nothing is duplicated
    throw e
  }
}

export async function organize(db: Db, base: string, items: MoveRequest[]): Promise<MoveResult[]> {
  if (!items.length) return []
  const opId = Number(run(db, "INSERT INTO operations (operation_type, status, created_at) VALUES ('organize', 'running', ?)", Date.now()).lastInsertRowid)
  const results: MoveResult[] = []

  for (const it of items) {
    const f = one<FileRecord>(db, 'SELECT * FROM files WHERE id = ?', it.fileId)
    if (!f) {
      results.push({ fileId: it.fileId, filename: 'Unknown file', ok: false, error: 'This file is no longer in the index. Scan again.' })
      continue
    }
    // Written before the move so an interrupted run can be recovered.
    const itemId = Number(run(db, "INSERT INTO operation_items (operation_id, file_id, original_path, destination_path, status) VALUES (?, ?, ?, ?, 'pending')", opId, f.id, f.current_path, it.to).lastInsertRowid)
    let error: string | undefined
    if (!isInside(base, it.to)) {
      error = 'The destination is outside the folder being organized.'
    } else {
      try {
        await mkdir(dirname(it.to), { recursive: true })
        await safeMove(f.current_path, it.to)
      } catch (e) {
        error = friendly(e)
      }
    }
    if (error) {
      run(db, "UPDATE operation_items SET status = 'failed', error_message = ? WHERE id = ?", error, itemId)
    } else {
      tx(db, () => {
        run(db, "UPDATE operation_items SET status = 'done' WHERE id = ?", itemId)
        run(db, 'DELETE FROM files WHERE current_path = ? AND id <> ?', it.to, f.id) // stale row for a file that is gone
        run(db, 'UPDATE files SET current_path = ? WHERE id = ?', it.to, f.id)
      })
    }
    results.push({ fileId: f.id, filename: f.filename, ok: !error, error })
  }

  const failed = results.filter((r) => !r.ok).length
  run(db, 'UPDATE operations SET status = ?, completed_at = ? WHERE id = ?', failed === 0 ? 'completed' : failed === results.length ? 'failed' : 'partial', Date.now(), opId)
  return results
}

export async function undo(db: Db, operationId: number): Promise<MoveResult[]> {
  const items = all<OperationItem>(db, "SELECT * FROM operation_items WHERE operation_id = ? AND status = 'done' ORDER BY id", operationId)
  const results: MoveResult[] = []
  for (const it of items) {
    let error: string | undefined
    try {
      if (!existsSync(it.destination_path)) throw new Error('The file is no longer at its new location.')
      if (existsSync(it.original_path)) throw new Error('Another file is already in the original location.')
      await mkdir(dirname(it.original_path), { recursive: true })
      await safeMove(it.destination_path, it.original_path)
    } catch (e) {
      error = friendly(e)
    }
    if (error) {
      run(db, 'UPDATE operation_items SET error_message = ? WHERE id = ?', error, it.id)
    } else {
      tx(db, () => {
        run(db, "UPDATE operation_items SET status = 'undone', error_message = NULL WHERE id = ?", it.id)
        run(db, 'DELETE FROM files WHERE current_path = ? AND id <> ?', it.original_path, it.file_id)
        run(db, 'UPDATE files SET current_path = ? WHERE current_path = ?', it.original_path, it.destination_path)
      })
    }
    results.push({ fileId: it.file_id, filename: basename(it.original_path), ok: !error, error })
  }
  if (!one(db, "SELECT 1 AS x FROM operation_items WHERE operation_id = ? AND status = 'done'", operationId)) {
    run(db, "UPDATE operations SET status = 'undone' WHERE id = ?", operationId)
  }
  return results
}

/** On startup: settle operations that were interrupted by a crash or power loss. */
export function recover(db: Db) {
  for (const op of all<{ id: number }>(db, "SELECT id FROM operations WHERE status = 'running'")) {
    for (const it of all<OperationItem>(db, "SELECT * FROM operation_items WHERE operation_id = ? AND status = 'pending'", op.id)) {
      if (existsSync(it.destination_path) && !existsSync(it.original_path)) {
        run(db, "UPDATE operation_items SET status = 'done' WHERE id = ?", it.id)
        run(db, 'UPDATE files SET current_path = ? WHERE current_path = ?', it.destination_path, it.original_path)
      } else {
        run(db, "UPDATE operation_items SET status = 'failed', error_message = 'Interrupted before the move finished.' WHERE id = ?", it.id)
      }
    }
    const failed = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM operation_items WHERE operation_id = ? AND status = 'failed'", op.id)!.n
    run(db, 'UPDATE operations SET status = ?, completed_at = ? WHERE id = ?', failed ? 'partial' : 'completed', Date.now(), op.id)
  }
}

export function history(db: Db, limit = 50): Operation[] {
  const ops = all<Operation>(db, 'SELECT * FROM operations ORDER BY id DESC LIMIT ?', limit)
  return ops.map((o) => ({
    ...o,
    items: all<OperationItem>(db, 'SELECT * FROM operation_items WHERE operation_id = ? ORDER BY id', o.id).map((i) => ({ ...i, filename: basename(i.original_path) })),
  }))
}

// ---------- search, duplicates, stats ----------

export function search(db: Db, p: SearchParams): FileRow[] {
  const where: string[] = []
  const args: (string | number)[] = []
  if (p.query) {
    where.push("f.filename LIKE ? ESCAPE '\\'")
    args.push(`%${p.query.replace(/[\\%_]/g, '\\$&')}%`)
  }
  if (p.extension) {
    where.push('f.extension = ?')
    args.push(p.extension.toLowerCase().replace(/^\./, ''))
  }
  if (p.category) {
    where.push('c.name = ?')
    args.push(p.category)
  }
  if (p.minSize != null) {
    where.push('f.size >= ?')
    args.push(p.minSize)
  }
  if (p.maxSize != null) {
    where.push('f.size < ?')
    args.push(p.maxSize)
  }
  if (p.modifiedAfter != null) {
    where.push('f.modified_at >= ?')
    args.push(p.modifiedAfter)
  }
  return all<FileRow>(
    db,
    `SELECT f.*, c.name AS category FROM files f LEFT JOIN categories c ON c.id = f.category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.modified_at DESC LIMIT 500`,
    ...args,
  )
}

export function duplicates(db: Db): DuplicateGroup[] {
  return all<{ hash: string }>(db, 'SELECT hash FROM files WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*) > 1')
    .map(({ hash }) => {
      const files = all<FileRecord>(db, 'SELECT * FROM files WHERE hash = ? ORDER BY current_path', hash)
      return { hash, size: files[0].size, files }
    })
    .sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1))
}

export function stats(db: Db, root: string): Stats {
  const t = one<{ n: number; size: number | null }>(db, 'SELECT COUNT(*) AS n, SUM(size) AS size FROM files')!
  const uncategorized = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM files WHERE confidence_score IS NULL OR confidence_score < ?', REVIEW_THRESHOLD)!.n
  const dupes = one<{ n: number }>(db, 'SELECT COALESCE(SUM(c - 1), 0) AS n FROM (SELECT COUNT(*) AS c FROM files WHERE hash IS NOT NULL GROUP BY hash HAVING c > 1)')!.n
  const categories = all<{ name: string; count: number }>(
    db,
    'SELECT c.name AS name, COUNT(f.id) AS count FROM categories c JOIN files f ON f.category_id = c.id GROUP BY c.id ORDER BY count DESC, name',
  )
  const toOrganize = all<{ current_path: string }>(db, 'SELECT current_path FROM files').filter((f) => sameDir(f.current_path, root)).length
  const last = getSetting(db, 'last_scan')
  return {
    total: t.n, totalSize: t.size ?? 0, categorized: t.n - uncategorized, uncategorized, duplicates: dupes,
    toOrganize, lastScan: last ? Number(last) : null, categories, recent: history(db, 5),
  }
}

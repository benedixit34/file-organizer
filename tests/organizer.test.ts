import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb, run, type Db } from '../src/database/db.ts'
import { scan } from '../src/services/scanner.ts'
import {
  addCategory, classifyAll, duplicates, history, organize, preview, recover, retarget, search, stats, undo,
} from '../src/services/organizer.ts'

let root: string
let db: Db

// Files younger than a few seconds are treated as "still downloading", so age them.
function put(name: string, content = name, dir = root) {
  const p = join(dir, name)
  writeFileSync(p, content)
  const old = new Date(Date.now() - 60_000)
  utimesSync(p, old, old)
  return p
}
async function indexed() {
  const r = await scan(db, root)
  classifyAll(db)
  return r
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sfo-'))
  db = openDb(':memory:')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('scan', () => {
  it('indexes files, skips partial downloads and fresh files, ignores folders', async () => {
    put('a.pdf')
    put('b.png')
    put('c.crdownload')
    mkdirSync(join(root, 'folder'))
    writeFileSync(join(root, 'fresh.pdf'), 'x') // just written
    const r = await indexed()
    expect(r.scanned).toBe(2)
    expect(r.skipped).toBe(2)
    expect(stats(db, root).total).toBe(2)
  })

  it('does not modify files', async () => {
    const p = put('a.pdf', 'hello')
    await indexed()
    expect(readFileSync(p, 'utf8')).toBe('hello')
  })

  it('reports a missing folder instead of crashing', async () => {
    await expect(scan(db, join(root, 'nope'))).rejects.toThrow('Can’t open')
  })

  it('stops when cancelled', async () => {
    put('a.pdf')
    const ac = new AbortController()
    ac.abort()
    expect((await scan(db, root, undefined, ac.signal)).cancelled).toBe(true)
  })

  it('forgets files that disappeared', async () => {
    const p = put('a.pdf')
    put('b.pdf')
    await indexed()
    rmSync(p)
    await indexed()
    expect(stats(db, root).total).toBe(1)
  })
})

describe('duplicates and search', () => {
  it('finds identical content only', async () => {
    put('one.pdf', 'same content')
    put('two (1).pdf', 'same content')
    put('other.pdf', 'differ content') // same length, different bytes
    await indexed()
    const groups = duplicates(db)
    expect(groups).toHaveLength(1)
    expect(groups[0].files.map((f) => f.filename).sort()).toEqual(['one.pdf', 'two (1).pdf'])
    expect(stats(db, root).duplicates).toBe(1)
  })

  it('searches by partial name, extension and category', async () => {
    put('Invoice_May.pdf')
    put('notes.txt')
    put('photo.png')
    await indexed()
    expect(search(db, { query: 'voice' }).map((f) => f.filename)).toEqual(['Invoice_May.pdf'])
    expect(search(db, { extension: '.PNG' }).map((f) => f.filename)).toEqual(['photo.png'])
    expect(search(db, { category: 'Documents' })).toHaveLength(2)
    expect(search(db, { query: '%' })).toHaveLength(0) // wildcard is literal
  })
})

describe('preview', () => {
  it('proposes destinations and queues low-confidence files for review', async () => {
    put('invoice_2026.pdf')
    put('mystery.xyz')
    await indexed()
    const rows = preview(db, root)
    const inv = rows.find((r) => r.filename === 'invoice_2026.pdf')!
    expect(inv.to).toBe(join(root, 'Documents', 'Invoices', 'invoice_2026.pdf'))
    expect(inv.status).toBe('ready')
    expect(rows.find((r) => r.filename === 'mystery.xyz')!.status).toBe('review')
  })

  it('flags name conflicts and offers a free name', async () => {
    mkdirSync(join(root, 'Documents'))
    put('a.pdf', 'incoming')
    put('a.pdf', 'already there', join(root, 'Documents'))
    await indexed()
    const row = preview(db, root).find((r) => r.filename === 'a.pdf')!
    expect(row.status).toBe('conflict')
    expect(row.renamedTo).toBe(join(root, 'Documents', 'a (1).pdf'))
    expect(row.existing!.size).toBe('already there'.length)
  })

  it('uses custom categories and lets the user retarget a file', async () => {
    put('plan.dwg')
    await indexed()
    expect(preview(db, root)[0].category).toBe('Needs Review')
    addCategory(db, 'CAD', '.dwg, skp')
    expect(preview(db, root)[0].category).toBe('CAD')
    const moved = retarget(db, root, preview(db, root)[0].fileId, 'Documents')
    expect(moved.to).toBe(join(root, 'Documents', 'plan.dwg'))
  })

  it('validates custom categories', () => {
    expect(() => addCategory(db, '', 'dwg')).toThrow('name')
    expect(() => addCategory(db, 'a/b', 'dwg')).toThrow('can’t contain')
    expect(() => addCategory(db, 'Images', 'dwg')).toThrow('already exists')
    expect(() => addCategory(db, 'CAD', '')).toThrow('extension')
  })
})

describe('organize and undo', () => {
  it('moves approved files, records history, and undoes', async () => {
    const p = put('invoice_2026.pdf', 'data')
    await indexed()
    const row = preview(db, root)[0]
    const res = await organize(db, root, [{ fileId: row.fileId, to: row.to }])
    expect(res[0].ok).toBe(true)
    expect(existsSync(p)).toBe(false)
    expect(readFileSync(row.to, 'utf8')).toBe('data')

    const h = history(db)
    expect(h).toHaveLength(1)
    expect(h[0].status).toBe('completed')
    expect(h[0].items[0].original_path).toBe(p)
    expect(search(db, { query: 'invoice' })[0].current_path).toBe(row.to)

    const back = await undo(db, h[0].id)
    expect(back[0].ok).toBe(true)
    expect(readFileSync(p, 'utf8')).toBe('data')
    expect(existsSync(row.to)).toBe(false)
    expect(history(db)[0].status).toBe('undone')
  })

  it('never overwrites a file that appears at the destination', async () => {
    const p = put('a.pdf', 'mine')
    await indexed()
    const row = preview(db, root)[0]
    mkdirSync(join(root, 'Documents'))
    writeFileSync(row.to, 'someone else’s') // appears after the preview
    const res = await organize(db, root, [{ fileId: row.fileId, to: row.to }])
    expect(res[0].ok).toBe(false)
    expect(res[0].error).toContain('already exists')
    expect(readFileSync(row.to, 'utf8')).toBe('someone else’s')
    expect(readFileSync(p, 'utf8')).toBe('mine')
    expect(history(db)[0].status).toBe('failed')
  })

  it('keeps going when one file fails', async () => {
    put('a.pdf')
    put('b.pdf')
    await indexed()
    const rows = preview(db, root)
    rmSync(rows[0].from) // vanishes before the move
    const res = await organize(db, root, rows.map((r) => ({ fileId: r.fileId, to: r.to })))
    expect(res.map((r) => r.ok)).toEqual([false, true])
    expect(history(db)[0].status).toBe('partial')
  })

  it('refuses destinations outside the organized folder', async () => {
    const p = put('a.pdf')
    await indexed()
    const row = preview(db, root)[0]
    const res = await organize(db, root, [{ fileId: row.fileId, to: join(root, '..', 'escaped.pdf') }])
    expect(res[0].ok).toBe(false)
    expect(existsSync(p)).toBe(true)
  })

  it('does not undo over a file now in the original location', async () => {
    const p = put('a.pdf', 'first')
    await indexed()
    const row = preview(db, root)[0]
    await organize(db, root, [{ fileId: row.fileId, to: row.to }])
    writeFileSync(p, 'newcomer')
    const res = await undo(db, history(db)[0].id)
    expect(res[0].ok).toBe(false)
    expect(readFileSync(p, 'utf8')).toBe('newcomer')
    expect(readFileSync(row.to, 'utf8')).toBe('first')
    expect(history(db)[0].status).toBe('completed')
  })

  it('renamed incoming files keep both versions', async () => {
    mkdirSync(join(root, 'Documents'))
    put('a.pdf', 'incoming')
    put('a.pdf', 'existing', join(root, 'Documents'))
    await indexed()
    const row = preview(db, root).find((r) => r.status === 'conflict')!
    await organize(db, root, [{ fileId: row.fileId, to: row.renamedTo! }])
    expect(readFileSync(join(root, 'Documents', 'a.pdf'), 'utf8')).toBe('existing')
    expect(readFileSync(join(root, 'Documents', 'a (1).pdf'), 'utf8')).toBe('incoming')
  })
})

describe('recover', () => {
  it('settles operations interrupted mid-run', async () => {
    const a = put('a.pdf')
    const b = put('b.pdf')
    await indexed()
    const rows = preview(db, root)
    // Simulate a crash: operation left "running", first move done on disk, second never started.
    mkdirSync(join(root, 'Documents'))
    writeFileSync(rows[0].to, 'x')
    rmSync(a)
    const op = Number(run(db, "INSERT INTO operations (operation_type, status, created_at) VALUES ('organize','running',1)").lastInsertRowid)
    for (const r of rows) {
      run(db, "INSERT INTO operation_items (operation_id, file_id, original_path, destination_path, status) VALUES (?, ?, ?, ?, 'pending')", op, r.fileId, r.from, r.to)
    }
    recover(db)
    const h = history(db)[0]
    expect(h.status).toBe('partial')
    expect(h.items.map((i) => i.status)).toEqual(['done', 'failed'])
    expect(existsSync(b)).toBe(true)
  })
})

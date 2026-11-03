import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { getSetting, setSetting, type Db } from '../../src/database/db.ts'
import {
  addCategory, classifyAll, duplicates, getCategories, history, organize, preview, removeCategory,
  retarget, search, stats, undo,
} from '../../src/services/organizer.ts'
import { scan } from '../../src/services/scanner.ts'

export function registerFileIpc(db: Db) {
  let abort: AbortController | null = null
  const root = () => getSetting(db, 'root') ?? app.getPath('downloads')

  ipcMain.handle('getRoot', () => root())
  ipcMain.handle('chooseRoot', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: root() })
      : await dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: root() })
    if (!r.canceled && r.filePaths[0]) setSetting(db, 'root', r.filePaths[0])
    return root()
  })

  ipcMain.handle('scan', async (e) => {
    if (abort) throw new Error('A scan is already running.')
    abort = new AbortController()
    try {
      const result = await scan(db, root(), (p) => e.sender.send('scanProgress', p), abort.signal)
      classifyAll(db)
      if (!result.cancelled) setSetting(db, 'last_scan', String(Date.now()))
      return result
    } finally {
      abort = null
    }
  })
  ipcMain.handle('cancelScan', () => abort?.abort())

  ipcMain.handle('stats', () => stats(db, root()))
  ipcMain.handle('search', (_, p) => search(db, p))
  ipcMain.handle('duplicates', () => duplicates(db))
  ipcMain.handle('preview', () => preview(db, root()))
  ipcMain.handle('retarget', (_, fileId: number, category: string) => retarget(db, root(), fileId, category))
  ipcMain.handle('organize', (_, items) => organize(db, root(), items))
  ipcMain.handle('history', () => history(db))
  ipcMain.handle('undo', (_, id: number) => undo(db, id))
  ipcMain.handle('categories', () => getCategories(db))
  ipcMain.handle('addCategory', (_, name: string, ext: string) => addCategory(db, name, ext))
  ipcMain.handle('removeCategory', (_, id: number) => removeCategory(db, id))
}

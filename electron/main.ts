import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { openDb } from '../src/database/db.ts'
import { recover } from '../src/services/organizer.ts'
import { registerFileIpc } from './ipc/files'

const devUrl = process.env['ELECTRON_RENDERER_URL']

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#edf1f4',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  const db = openDb(join(app.getPath('userData'), 'organizer.db'))
  recover(db)
  registerFileIpc(db)
  createWindow()
})

app.on('window-all-closed', () => app.quit())

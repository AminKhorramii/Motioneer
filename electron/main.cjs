const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs/promises')

// live pages under shaders later, so the flag ships with the app
app.commandLine.appendSwitch('enable-blink-features', 'HTMLInCanvas,CanvasDrawElement')
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

if (process.env.WALL_DATA) app.setPath('userData', process.env.WALL_DATA)

let win = null
const statePath = () => path.join(app.getPath('userData'), 'wall-state.json')

function createWindow() {
  win = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0a0b0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.on('closed', () => {
    win = null
  })
}

ipcMain.handle('state:read', async () => {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8'))
  } catch {
    return null
  }
})
ipcMain.handle('state:write', async (_e, v) => {
  await fs.writeFile(statePath(), JSON.stringify(v), 'utf8')
  return true
})

/** ship: a real, self-contained index.html the founder owns */
ipcMain.handle('page:export', async (_e, html, name) => {
  let dir = process.env.WALL_EXPORT_DIR
  if (!dir) {
    const res = await dialog.showOpenDialog(win, {
      title: 'Where should the page go?',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null
    dir = res.filePaths[0]
  }
  const out = path.join(dir, String(name || 'landing'))
  await fs.mkdir(out, { recursive: true })
  const file = path.join(out, 'index.html')
  await fs.writeFile(file, String(html), 'utf8')
  if (!process.env.WALL_TEST) void shell.openPath(out)
  return { file, bytes: Buffer.byteLength(String(html)) }
})

ipcMain.handle('page:preview', async (_e, html) => {
  const file = path.join(app.getPath('temp'), `wall-preview-${Date.now()}.html`)
  await fs.writeFile(file, String(html), 'utf8')
  if (!process.env.WALL_TEST) void shell.openPath(file)
  return file
})

/** the model path, from the main process so there is no CORS wall */
ipcMain.handle('model:stream', async (e, id, provider, system, user, key) => {
  const { streamText } = await import(pathToFileURL(path.join(__dirname, '..', 'shared', 'providers.mjs')).href)
  return streamText(provider, system, user, key, (delta) => {
    if (!e.sender.isDestroyed()) e.sender.send('model:delta', id, delta)
  })
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || process.env.WALL_TEST) app.quit()
})

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAccountsIpc } from './ipc/accounts'
import { registerMailIpc } from './ipc/mail'
import { registerSettingsIpc } from './ipc/settings'
import { registerOllamaIpc } from './ipc/ollama'
import { registerContactsIpc } from './ipc/contacts'
import { registerDialogIpc } from './ipc/dialog'
import { registerApiKeysIpc } from './ipc/apiKeys'
import { registerAppIpc } from './ipc/app'
import { registerPendingIpc } from './ipc/pending'
import { setMainWindow } from './windowManager'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Los links dentro del cuerpo de un email (iframe sandboxeado) navegan el propio
  // frame en vez de abrir una ventana nueva — los mandamos al navegador del sistema.
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && /^https?:/i.test(event.url)) {
      event.preventDefault()
      shell.openExternal(event.url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('ar.com.blaster.emailclient')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAccountsIpc()
  registerMailIpc()
  registerSettingsIpc()
  registerOllamaIpc()
  registerContactsIpc()
  registerDialogIpc()
  registerApiKeysIpc()
  registerAppIpc()
  registerPendingIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

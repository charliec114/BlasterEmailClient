import type { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window
}

// Avisa a la UI que el correo cambió por una vía ajena a ella (ej. el servidor MCP), así
// re-lista en vez de mostrar datos viejos.
export function notifyMailChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mcp:mail-changed')
}

// Avisa a la UI que hay borradores nuevos en la cola del MCP; ella los toma cuando no tenga un
// redactor abierto. Sin ventana, quedan en la cola hasta que se abra la app.
export function notifyDraftsQueued(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('mcp:drafts-changed')
  focusMainWindow()
}

export function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

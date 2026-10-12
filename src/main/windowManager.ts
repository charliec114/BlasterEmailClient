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

// Pide a la UI abrir el redactor con un borrador (el usuario lo revisa y envía él).
export function openComposeInWindow(draft: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('La ventana de Blaster no está abierta')
  mainWindow.webContents.send('mcp:open-compose', draft)
  focusMainWindow()
}

export function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

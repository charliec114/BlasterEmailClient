import { safeStorage } from 'electron'

export function encryptSecret(plainText: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'El cifrado de credenciales no está disponible en este sistema (falta un keyring del OS, ej. gnome-keyring/kwallet).'
    )
  }
  return safeStorage.encryptString(plainText)
}

export function decryptSecret(encrypted: Buffer): string {
  return safeStorage.decryptString(encrypted)
}

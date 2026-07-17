import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { deleteContact, listContacts, searchContacts } from '../services/contactsRepository'

export function registerContactsIpc(): void {
  ipcMain.handle(IPC.contactsSearch, (_event, query: string) => searchContacts(query))
  ipcMain.handle(IPC.contactsList, () => listContacts())
  ipcMain.handle(IPC.contactsRemove, (_event, email: string) => deleteContact(email))
}

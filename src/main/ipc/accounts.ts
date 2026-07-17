import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AccountInput } from '@shared/types'
import {
  addAccount,
  addGoogleAccount,
  listAccounts,
  removeAccount,
  resolveAccountPasswords,
  updateAccount
} from '../services/accountsRepository'
import { testAccountConnection } from '../services/mailConnection'
import { connectGoogleAccount } from '../services/googleOAuth'

export function registerAccountsIpc(): void {
  ipcMain.handle(IPC.accountsList, () => listAccounts())

  ipcMain.handle(IPC.accountsAdd, (_event, input: AccountInput) => addAccount(input))

  ipcMain.handle(IPC.accountsUpdate, (_event, id: string, input: AccountInput) => updateAccount(id, input))

  ipcMain.handle(IPC.accountsRemove, (_event, id: string) => removeAccount(id))

  ipcMain.handle(IPC.accountsTestConnection, (_event, input: AccountInput, accountId?: string) => {
    const resolved = accountId ? resolveAccountPasswords(accountId, input) : input
    return testAccountConnection(resolved)
  })

  ipcMain.handle(IPC.accountsConnectGoogle, async () => {
    const { email, name, refreshToken } = await connectGoogleAccount()
    return addGoogleAccount(email, name, refreshToken)
  })
}

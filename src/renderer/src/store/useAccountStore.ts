import { create } from 'zustand'
import type { Account, AccountInput, ConnectionTestResult } from '@shared/types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface AccountStore {
  accounts: Account[]
  loading: boolean
  error: string | null
  fetchAccounts: () => Promise<void>
  addAccount: (input: AccountInput) => Promise<Account>
  updateAccount: (id: string, input: AccountInput) => Promise<Account>
  removeAccount: (id: string) => Promise<void>
  testConnection: (input: AccountInput, accountId?: string) => Promise<ConnectionTestResult>
  connectGoogle: () => Promise<Account>
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null })
    try {
      const accounts = await window.api.accounts.list()
      set({ accounts, loading: false })
    } catch (error) {
      set({ error: errorMessage(error), loading: false })
    }
  },

  addAccount: async (input) => {
    const account = await window.api.accounts.add(input)
    set({ accounts: [...get().accounts, account] })
    return account
  },

  updateAccount: async (id, input) => {
    const account = await window.api.accounts.update(id, input)
    set({ accounts: get().accounts.map((a) => (a.id === id ? account : a)) })
    return account
  },

  removeAccount: async (id) => {
    await window.api.accounts.remove(id)
    set({ accounts: get().accounts.filter((account) => account.id !== id) })
  },

  testConnection: (input, accountId) => window.api.accounts.testConnection(input, accountId),

  connectGoogle: async () => {
    const account = await window.api.accounts.connectGoogle()
    set({ accounts: [...get().accounts, account] })
    return account
  }
}))

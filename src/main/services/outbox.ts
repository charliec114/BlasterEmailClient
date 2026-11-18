import { net } from 'electron'
import type { SendMailInput, SendMailResult } from '@shared/types'
import { sendMail } from './mailSend'
import { isNeverConnectedError } from './netUtil'
import { scheduleMail } from './scheduledMailRepository'
import { notifyMailChanged } from '../windowManager'

function enqueue(input: SendMailInput): SendMailResult {
  scheduleMail({ ...input, scheduledFor: new Date().toISOString() }, { outbox: true })
  notifyMailChanged()
  return { queued: true }
}

// Envío del redactor: si no hay conexión, en vez de fallar el mensaje queda en la cola de salida
// (la misma tabla de los programados, marcada como `outbox`) y el watcher lo manda al volver internet.
// Sólo se reencola si el fallo fue antes de conectar con el servidor; una caída a mitad del envío es
// ambigua (puede que el servidor ya lo haya aceptado) y se informa como error para no duplicar.
export async function sendOrQueue(input: SendMailInput): Promise<SendMailResult> {
  if (!net.isOnline()) return enqueue(input)
  try {
    await sendMail(input)
    return { queued: false }
  } catch (error) {
    if (isNeverConnectedError(error)) return enqueue(input)
    throw error
  }
}

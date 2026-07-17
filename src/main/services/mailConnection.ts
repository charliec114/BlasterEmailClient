import { ImapFlow } from 'imapflow'
import { createTransport } from 'nodemailer'
import Pop3Command from 'node-pop3'
import type { AccountInput, ConnectionCheckResult, ConnectionTestResult } from '@shared/types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function testImap(config: AccountInput['incoming']): Promise<ConnectionCheckResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
    logger: false
  })

  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

async function testPop3(config: AccountInput['incoming']): Promise<ConnectionCheckResult> {
  const pop3 = new Pop3Command({
    host: config.host,
    port: config.port,
    tls: config.secure,
    user: config.username,
    password: config.password
  })

  try {
    await pop3.connect()
    await pop3.command('USER', config.username)
    await pop3.command('PASS', config.password)
    await pop3.command('QUIT')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

async function testSmtp(config: AccountInput['outgoing']): Promise<ConnectionCheckResult> {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password }
  })

  try {
    await transporter.verify()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function testAccountConnection(input: AccountInput): Promise<ConnectionTestResult> {
  const [incoming, outgoing] = await Promise.all([
    input.protocol === 'imap' ? testImap(input.incoming) : testPop3(input.incoming),
    testSmtp(input.outgoing)
  ])

  return { incoming, outgoing }
}

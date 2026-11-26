import { ImapFlow } from 'imapflow'

import { APP_NAME } from '../../shared/constants'
import type { AccountSettings } from '../config'
import { MailError, toMailError } from './errors'

export class Connection {
  private client: ImapFlow | null = null
  private connecting: Promise<ImapFlow> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private settings: AccountSettings | null) {}

  get account(): string | null {
    return this.settings?.email ?? null
  }

  updateSettings(settings: AccountSettings | null): void {
    this.settings = settings
  }

  /** 建立连接并验证凭证，供引导页自检使用 */
  async verify(settings: AccountSettings): Promise<ImapFlow> {
    const client = this.build(settings)
    try {
      await client.connect()
      return client
    } catch (error) {
      throw toMailError(error)
    }
  }

  async ensure(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client
    if (!this.settings) throw new MailError('NO_ACCOUNT', '尚未配置邮箱')
    if (!this.connecting) {
      this.connecting = this.open().finally(() => {
        this.connecting = null
      })
    }
    return this.connecting
  }

  private build(settings: AccountSettings): ImapFlow {
    return new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: settings.secure,
      auth: { user: settings.email, pass: settings.password },
      logger: false,
      emitLogs: false,
      clientInfo: { name: APP_NAME, version: '0.1.0', vendor: 'MailTodo' },
      disableAutoIdle: true,
    })
  }

  private async open(): Promise<ImapFlow> {
    if (!this.settings) throw new MailError('NO_ACCOUNT', '尚未配置邮箱')
    const client = this.build(this.settings)
    client.on('error', () => {
      if (this.client === client) this.client = null
    })
    client.on('close', () => {
      if (this.client === client) this.client = null
    })

    try {
      await client.connect()
    } catch (error) {
      throw toMailError(error)
    }

    this.client = client
    return client
  }

  async close(): Promise<void> {
    const client = this.client
    this.client = null
    if (!client) return
    try {
      await client.logout()
    } catch {
      client.close()
    }
  }

  /** 写操作串行执行，避免同一封邮件的 flag 互相覆盖 */
  serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => undefined)
    return next
  }

  run<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      try {
        const client = await this.ensure()
        return await operation(client)
      } catch (error) {
        throw toMailError(error)
      }
    })
  }
}

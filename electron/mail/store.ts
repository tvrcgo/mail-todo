import type { ImapFlow } from 'imapflow'

import { MailError } from './errors'

const HEADER_FIELDS = ['subject', 'date', 'message-id', 'x-todo-id', 'x-todo-rev', 'x-todo-due']
const CRLFCRLF = '\r\n\r\n'

export interface RawRow {
  folder: string
  uid: number
  headers: string
  flags: string[]
}

export async function withFolder<T>(client: ImapFlow, folder: string, run: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(folder, { readOnly: false })
  try {
    return await run()
  } finally {
    lock.release()
  }
}

export async function fetchRows(client: ImapFlow, folder: string, range = '1:*'): Promise<RawRow[]> {
  assertMailbox(client, folder)
  const rows: RawRow[] = []
  for await (const item of client.fetch(range, { uid: true, flags: true, headers: HEADER_FIELDS }, { uid: true })) {
    rows.push({
      folder,
      uid: item.uid,
      headers: item.headers ? item.headers.toString('utf8') : '',
      flags: [...(item.flags ?? [])],
    })
  }
  return rows
}

/** 这些命令都作用于"当前已选中的文件夹"，选错文件夹会写坏数据，故显式校验 */
function assertMailbox(client: ImapFlow, folder: string): void {
  const mailbox = client.mailbox
  if (!mailbox || mailbox.path !== folder) {
    throw new MailError('MAILBOX_MISMATCH', `当前打开的文件夹不是 ${folder}`)
  }
}

export async function fetchFlags(client: ImapFlow, folder: string): Promise<Map<number, string[]>> {
  assertMailbox(client, folder)
  const map = new Map<number, string[]>()
  for await (const item of client.fetch('1:*', { uid: true, flags: true }, { uid: true })) {
    map.set(item.uid, [...(item.flags ?? [])])
  }
  return map
}

export async function currentUidState(client: ImapFlow, folder: string): Promise<{ uidValidity: string; uidNext: number }> {
  const mailbox = await client.mailboxOpen(folder, { readOnly: true })
  return { uidValidity: String(mailbox.uidValidity), uidNext: Number(mailbox.uidNext) }
}

export async function appendTask(client: ImapFlow, folder: string, message: string, flags: string[] = []): Promise<number> {
  const result = await client.append(folder, Buffer.from(message, 'utf8'), flags)
  if (!result || typeof result.uid !== 'number') {
    throw new MailError('APPEND_FAILED', '邮件已发送但服务器未返回位置，请稍后刷新')
  }
  return result.uid
}

export async function setTaskFlags(
  client: ImapFlow,
  folder: string,
  uid: number,
  flags: string[],
  action: 'add' | 'remove',
): Promise<void> {
  assertMailbox(client, folder)
  const target = { uid: String(uid) }
  if (action === 'add') await client.messageFlagsAdd(target, flags, { uid: true })
  else await client.messageFlagsRemove(target, flags, { uid: true })
}

export async function deleteTask(client: ImapFlow, folder: string, uid: number, trashPath: string | null): Promise<void> {
  const target = { uid: String(uid) }
  if (trashPath && trashPath !== folder) {
    await client.messageCopy(target, trashPath, { uid: true })
  }
  await client.messageDelete(target, { uid: true })
}

export async function fetchBody(client: ImapFlow, folder: string, uid: number): Promise<string> {
  assertMailbox(client, folder)
  const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
  if (!message || !message.source) return ''
  return decodeBody(message.source)
}

export function decodeBody(source: Buffer): string {
  const text = source.toString('latin1')
  const splitAt = text.indexOf(CRLFCRLF)
  if (splitAt < 0) return ''

  const headerText = text.slice(0, splitAt)
  const bodyText = source.subarray(splitAt + CRLFCRLF.length)
  const headers = parsePartHeaders(headerText)
  const contentType = (headers.get('content-type') ?? 'text/plain').toLowerCase()

  if (contentType.startsWith('multipart/')) {
    const boundary = /boundary="?([^";]+)"?/.exec(headers.get('content-type') ?? '')?.[1]
    if (!boundary) return ''
    for (const part of splitMultipart(bodyText, boundary)) {
      const decoded = decodeBody(part)
      if (decoded.trim()) return decoded
    }
    return ''
  }

  return decodeTransfer(bodyText, headers.get('content-transfer-encoding'), contentType)
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const delimiter = Buffer.from(`--${boundary}`, 'latin1')
  const parts: Buffer[] = []
  let index = body.indexOf(delimiter)

  while (index >= 0) {
    const start = index + delimiter.length
    if (body.subarray(start, start + 2).toString('latin1') === '--') break
    const next = body.indexOf(delimiter, start)
    if (next < 0) break
    parts.push(trimCrlf(body.subarray(start, next)))
    index = next
  }

  return parts
}

function trimCrlf(buffer: Buffer): Buffer {
  // 头部空行与 boundary 前的 CRLF 都是 MIME 分隔符，不属于正文
  const text = buffer.toString('latin1').replace(/^\r?\n/, '').replace(/\r?\n$/, '')
  return Buffer.from(text, 'latin1')
}

function parsePartHeaders(headerText: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of headerText.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    map.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim())
  }
  return map
}

function decodeTransfer(body: Buffer, encoding: string | undefined, contentType: string): string {
  const charset = /charset="?([^";]+)"?/.exec(contentType)?.[1]?.trim().toLowerCase() ?? 'utf-8'
  const normalized = (encoding ?? '7bit').trim().toLowerCase()

  let bytes = body
  if (normalized === 'base64') {
    bytes = Buffer.from(body.toString('latin1').replace(/\r?\n/g, ''), 'base64')
  } else if (normalized === 'quoted-printable') {
    bytes = decodeQuotedPrintable(body.toString('latin1'))
  }

  return decodeCharset(bytes, charset)
}

function decodeQuotedPrintable(input: string): Buffer {
  const bytes: number[] = []
  const text = input.replace(/=\r?\n/g, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(text.charCodeAt(i) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

function decodeCharset(bytes: Buffer, charset: string): string {
  if (charset === 'utf-8' || charset === 'utf8' || charset === 'us-ascii') return bytes.toString('utf8')
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}


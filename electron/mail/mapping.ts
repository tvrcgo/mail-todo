import { HEADER_DUE, HEADER_ID, HEADER_REV, KNOWN_TODO_HEADERS } from '../../shared/constants'
import type { Task } from '../../shared/types'

const CRLF = '\r\n'

export interface RawRow {
  folder: string
  uid: number
  headers: string
  flags: string[]
}

export function parseTask(row: RawRow): Task | null {
  const headers = parseHeaders(row.headers)
  const subject = headers.get('subject') ?? ''
  const messageId = headers.get('message-id') ?? ''
  const id = headers.get(HEADER_ID.toLowerCase()) || messageId
  if (!id) return null

  const rev = Number.parseInt(headers.get(HEADER_REV.toLowerCase()) ?? '', 10)
  const createdAtRaw = headers.get('date')
  const { done, important } = parseFlags(row.flags)

  return {
    id,
    rev: Number.isFinite(rev) && rev > 0 ? rev : 1,
    folder: row.folder,
    uid: row.uid,
    title: subject.trim() || '(无标题)',
    notes: '',
    done,
    important,
    due: normalizeDue(headers.get(HEADER_DUE.toLowerCase()) ?? ''),
    createdAt: createdAtRaw ? parseDate(createdAtRaw) : new Date(0).toISOString(),
    messageId,
    extraHeaders: collectExtraHeaders(headers),
  }
}

export function groupByTaskId(tasks: Task[]): { tasks: Task[]; stale: Task[] } {
  const latest = new Map<string, Task>()
  const stale: Task[] = []

  for (const task of tasks) {
    const current = latest.get(task.id)
    if (!current) {
      latest.set(task.id, task)
      continue
    }
    if (task.rev > current.rev) {
      stale.push(current)
      latest.set(task.id, task)
    } else {
      stale.push(task)
    }
  }

  return { tasks: [...latest.values()], stale }
}

export interface BuildInput {
  from: string
  to: string
  task: Pick<Task, 'id' | 'rev' | 'title' | 'notes' | 'due' | 'messageId' | 'extraHeaders'>
  done?: boolean
  important?: boolean
}

export function buildMessage(input: BuildInput): string {
  const { task } = input
  const lines: string[] = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(task.title)}`,
    `Date: ${formatDate(new Date())}`,
    `Message-ID: ${task.messageId || `<${task.id}@mailtodo>`}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    `${HEADER_ID}: ${task.id}`,
    `${HEADER_REV}: ${task.rev}`,
  ]

  if (task.due) lines.push(`${HEADER_DUE}: ${task.due}`)
  for (const [name, value] of Object.entries(task.extraHeaders)) {
    if (KNOWN_TODO_HEADERS.some((known) => known.toLowerCase() === name.toLowerCase())) continue
    lines.push(`${name}: ${encodeHeaderValue(value)}`)
  }

  return lines.join(CRLF) + CRLF + CRLF + encodeBody(task.notes)
}

export function parseHeaders(raw: string): Map<string, string> {
  const map = new Map<string, string>()
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ')

  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index <= 0) continue
    const name = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (map.has(name)) map.set(name, `${map.get(name)}, ${value}`)
    else map.set(name, value)
  }

  for (const [name, value] of map) {
    map.set(name, decodeMimeWords(value))
  }
  return map
}

export function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, encoding: string, text: string) => {
    try {
      const decoded =
        encoding.toUpperCase() === 'B'
          ? decodeBytes(Buffer.from(text, 'base64'), charset)
          : decodeBytes(decodeQuotedPrintableWord(text), charset)
      return decoded || whole
    } catch {
      return whole
    }
  })
}

function decodeQuotedPrintableWord(text: string): Buffer {
  const bytes = Buffer.from(
    text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))),
    'latin1',
  )
  return bytes
}

function decodeBytes(bytes: Buffer, charset: string): string {
  const normalized = charset.toLowerCase().replace(/^utf8$/, 'utf-8')
  if (normalized === 'utf-8' || normalized === 'utf8') return bytes.toString('utf8')
  if (normalized === 'gb2312' || normalized === 'gbk') {
    try {
      return new TextDecoder('gbk').decode(bytes)
    } catch {
      return bytes.toString('utf8')
    }
  }
  return bytes.toString('utf8')
}

function isAsciiOnly(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value)
}

export function encodeHeaderValue(value: string): string {
  if (isAsciiOnly(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function encodeBody(text: string): string {
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  return encoded.replace(/.{1,76}/g, (chunk) => chunk + CRLF)
}

function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${days[date.getDay()]}, ${pad(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  )
}

function parseDate(raw: string): string {
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
}

export function normalizeDue(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function isSeen(flag: string): boolean {
  return flag.replace(/^\\/, '').toLowerCase() === 'seen'
}

function isFlagged(flag: string): boolean {
  return flag.replace(/^\\/, '').toLowerCase() === 'flagged'
}

export function parseFlags(flags: string[]): { done: boolean; important: boolean } {
  return { done: flags.some(isSeen), important: flags.some(isFlagged) }
}

function collectExtraHeaders(headers: Map<string, string>): Record<string, string> {
  const extra: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (!name.startsWith('x-todo-')) continue
    if (KNOWN_TODO_HEADERS.some((known) => known.toLowerCase() === name)) continue
    extra[name] = value
  }
  return extra
}

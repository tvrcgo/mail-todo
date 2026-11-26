export interface Task {
  id: string
  rev: number
  folder: string
  uid: number
  title: string
  notes: string
  done: boolean
  important: boolean
  due: string | null
  createdAt: string
  messageId: string
  extraHeaders: Record<string, string>
}

export interface ListInfo {
  path: string
  name: string
}

export interface AccountConfig {
  provider: string
  email: string
  imapHost: string
  imapPort: number
  secure: boolean
}

export interface Settings {
  provider: string
  email: string
  imapHost: string
  imapPort: number
  secure: boolean
  reminderTime: string
  launchAtLogin: boolean
  lastListPath: string | null
}

export interface FolderSnapshot {
  uidValidity: string
  uidNext: number
  tasks: Task[]
}

export interface Snapshot {
  version: number
  account: string
  inboxPath: string | null
  lists: ListInfo[]
  folders: Record<string, FolderSnapshot>
  notified: Record<string, string>
  syncedAt: string
}

export interface TaskPatch {
  title?: string
  notes?: string
  due?: string | null
}

export type ViewId = 'today' | 'important' | 'all' | `list:${string}`

export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export interface ConnectionStatus {
  connected: boolean
  email: string | null
  error: string | null
  syncing: boolean
  lastSyncedAt: string | null
}

export interface MailboxState {
  status: ConnectionStatus
  /** 收件箱路径，顶部「任务」导航即指向它 */
  inboxPath: string | null
  /** 用户自建的列表，对应 Todo- 前缀文件夹 */
  lists: ListInfo[]
  tasks: Task[]
}

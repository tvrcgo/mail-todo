import type { ImapFlow } from 'imapflow'

import type { ConnectionStatus, ListInfo, MailboxState, Task, TaskPatch } from '../../shared/types'
import type { AccountSettings } from '../config'
import { Connection } from './connection'
import { MailError, toMailError } from './errors'
import { createList, deleteList, findTrash, listFolders } from './folders'
import { buildMessage, groupByTaskId, parseFlags, parseTask } from './mapping'
import { emptySnapshot, readSnapshot, writeSnapshot } from './snapshot'
import {
  appendTask,
  currentUidState,
  deleteTask as deleteMail,
  fetchBody,
  fetchFlags,
  fetchRows,
  setTaskFlags,
  withFolder,
} from './store'

const FOCUSED_INTERVAL = 10_000
const IDLE_INTERVAL = 60_000

export class Mailbox {
  private snapshot = emptySnapshot('')
  private inboxPath: string | null = null
  private lists: ListInfo[] = []
  private tasks: Task[] = []
  private status: ConnectionStatus = {
    connected: false,
    email: null,
    error: null,
    syncing: false,
    lastSyncedAt: null,
  }
  private listeners = new Set<(state: MailboxState) => void>()
  private timer: NodeJS.Timeout | null = null
  private interval = IDLE_INTERVAL
  private syncing: Promise<void> | null = null

  constructor(private readonly connection: Connection) {}

  getState(): MailboxState {
    return { status: { ...this.status }, inboxPath: this.inboxPath, lists: [...this.lists], tasks: [...this.tasks] }
  }

  findTask(id: string): Task {
    const task = this.tasks.find((item) => item.id === id)
    if (!task) throw new MailError('NOT_FOUND', '任务已不存在，请刷新后重试')
    return task
  }

  notifiedSnapshot(): Record<string, string> {
    return this.snapshot.notified
  }

  async persist(): Promise<void> {
    await writeSnapshot(this.snapshot)
  }

  async verifyConnection(account: AccountSettings): Promise<void> {
    const client = await this.connection.verify(account)
    try {
      await listFolders(client)
    } finally {
      try {
        await client.logout()
      } catch {
        client.close()
      }
    }
  }

  onChange(listener: (state: MailboxState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }

  private setStatus(patch: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit()
  }

  async start(account: AccountSettings): Promise<void> {
    this.account = account
    this.connection.updateSettings(account)
    this.snapshot = (await readSnapshot(account.email)) ?? emptySnapshot(account.email)
    this.tasks = Object.values(this.snapshot.folders).flatMap((folder) => folder.tasks)
    this.inboxPath = this.snapshot.inboxPath
    this.lists = this.snapshot.lists
    this.status = { ...this.status, email: account.email }
    this.emit()

    this.restartTimer()
    await this.refresh()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.account = null
    this.inboxPath = null
    this.lists = []
    this.tasks = []
    this.snapshot = emptySnapshot('')
    this.status = { connected: false, email: null, error: null, syncing: false, lastSyncedAt: null }
    this.emit()
    await this.connection.close()
  }

  setFocused(focused: boolean): void {
    const next = focused ? FOCUSED_INTERVAL : IDLE_INTERVAL
    if (next === this.interval) return
    this.interval = next
    this.restartTimer()
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      void this.refresh().catch(() => undefined)
    }, this.interval)
  }

  refresh(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null
      })
    }
    return this.syncing
  }

  private async doSync(): Promise<void> {
    if (!this.account) return
    this.setStatus({ syncing: true })

    try {
      await this.connection.run(async (client) => {
        const { inbox, lists } = await listFolders(client)
        this.inboxPath = inbox
        this.lists = lists

        this.pruneMissingFolders()

        const collected: Task[] = []
        for (const folder of this.syncableFolders()) {
          collected.push(...(await this.syncFolder(client, folder)))
        }

        const { tasks } = groupByTaskId(collected)
        this.tasks = tasks
        this.snapshot.inboxPath = this.inboxPath
        this.snapshot.lists = this.lists
        this.snapshot.syncedAt = new Date().toISOString()
      })

      await writeSnapshot(this.snapshot)
      this.setStatus({ connected: true, error: null, syncing: false, lastSyncedAt: this.snapshot.syncedAt })
    } catch (error) {
      const mailError = toMailError(error)
      this.setStatus({ connected: false, error: mailError.message, syncing: false })
    }
  }

  private async syncFolder(client: ImapFlow, folder: string): Promise<Task[]> {
    const previous = this.snapshot.folders[folder]
    const { uidValidity, uidNext } = await currentUidState(client, folder)

    if (!previous || previous.uidValidity !== uidValidity) {
      const rows = await withFolder(client, folder, () => fetchRows(client, folder))
      const tasks = rows.map(parseTask).filter((task): task is Task => task !== null)
      this.snapshot.folders[folder] = { uidValidity, uidNext, tasks }
      return tasks
    }

    const fresh: Task[] = []
    if (uidNext > previous.uidNext) {
      const rows = await withFolder(client, folder, () => fetchRows(client, folder, `${previous.uidNext}:*`))
      fresh.push(...rows.map(parseTask).filter((task): task is Task => task !== null))
    }

    const flags = await withFolder(client, folder, () => fetchFlags(client, folder))
    const merged = previous.tasks
      .filter((task) => flags.has(task.uid))
      .map((task) => ({ ...task, ...parseFlags(flags.get(task.uid) ?? []) }))
    merged.push(...fresh)

    this.snapshot.folders[folder] = { uidValidity, uidNext, tasks: merged }
    return merged
  }


  /** 需要同步的文件夹 = 收件箱 + 用户自建列表 */
  private syncableFolders(): string[] {
    return [this.inboxPath, ...this.lists.map((list) => list.path)].filter(
      (path): path is string => typeof path === 'string' && path.length > 0,
    )
  }

  /** 列表可能在其它客户端被删，快照里遗留的任务不能继续参与聚合 */
  private pruneMissingFolders(): void {
    const alive = new Set(this.syncableFolders())
    for (const path of Object.keys(this.snapshot.folders)) {
      if (!alive.has(path)) delete this.snapshot.folders[path]
    }
  }

  private account: AccountSettings | null = null

  private requireAccount(): AccountSettings {
    if (!this.account) throw new MailError('NO_ACCOUNT', '尚未配置邮箱')
    return this.account
  }

  async createTask(listPath: string | null, patch: TaskPatch): Promise<Task> {
    const account = this.requireAccount()
    const folder = listPath ?? this.defaultListPath()
    if (!folder) throw new MailError('NO_LIST', '还没有可用的列表')
    const task: Task = {
      id: crypto.randomUUID(),
      rev: 1,
      folder,
      uid: 0,
      title: patch.title?.trim() || '(无标题)',
      notes: patch.notes ?? '',
      done: false,
      important: false,
      due: patch.due ?? null,
      createdAt: new Date().toISOString(),
      messageId: '',
      extraHeaders: {},
    }

    const raw = buildMessage({ from: account.email, to: account.email, task })
    const uid = await this.connection.run((client) =>
      withFolder(client, folder, async () => {
        const appended = await appendTask(client, folder, raw)
        return appended
      }),
    )

    const created = await this.connection.run((client) =>
      withFolder(client, folder, () => this.fetchTaskByUid(client, folder, uid, { ...task, uid })),
    )
    this.upsertTask(folder, created)
    this.publish()
    await writeSnapshot(this.snapshot)
    return created
  }

  /** 163 的 APPEND 不是立刻可读，逐次重试拿真实头部；拿不到就退回本地构造的任务 */
  private async fetchTaskByUid(client: ImapFlow, folder: string, uid: number, fallback: Task): Promise<Task> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const rows = await fetchRows(client, folder, `${uid}:${uid}`)
      const parsed = rows.map(parseTask).filter((task): task is Task => task !== null)
      if (parsed.length > 0) return parsed[0]
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return fallback
  }

  private upsertTask(folder: string, task: Task): void {
    const entry = this.snapshot.folders[folder]
    if (entry) {
      entry.tasks = [...entry.tasks.filter((item) => item.id !== task.id), task]
    } else {
      this.snapshot.folders[folder] = { uidValidity: '', uidNext: task.uid, tasks: [task] }
    }
  }

  private forgetTask(folder: string, uid: number): void {
    const entry = this.snapshot.folders[folder]
    if (entry) entry.tasks = entry.tasks.filter((task) => task.uid !== uid)
  }

  /** 一次写操作只推一次状态，避免"删除旧版→写入新版"之间的空帧闪掉 UI */
  private publish(): void {
    this.tasks = groupByTaskId(Object.values(this.snapshot.folders).flatMap((entry) => entry.tasks)).tasks
    this.emit()
  }

  async setDone(task: Task, done: boolean): Promise<void> {
    await this.mutateFlags(task, done ? ['\\Seen'] : [], done ? [] : ['\\Seen'])
  }

  async setImportant(task: Task, important: boolean): Promise<void> {
    await this.mutateFlags(task, important ? ['\\Flagged'] : [], important ? [] : ['\\Flagged'])
  }

  private async mutateFlags(task: Task, add: string[], remove: string[]): Promise<void> {
    await this.connection.run(async (client) => {
      await withFolder(client, task.folder, async () => {
        if (add.length) await setTaskFlags(client, task.folder, task.uid, add, 'add')
        if (remove.length) await setTaskFlags(client, task.folder, task.uid, remove, 'remove')
      })
    })
    this.applyLocal(task.id, {
      done: add.includes('\\Seen') ? true : remove.includes('\\Seen') ? false : task.done,
      important: add.includes('\\Flagged') ? true : remove.includes('\\Flagged') ? false : task.important,
    })
    await writeSnapshot(this.snapshot)
  }

  async updateTask(task: Task, patch: TaskPatch): Promise<void> {
    const account = this.requireAccount()
    const next: Task = {
      ...task,
      title: patch.title?.trim() || task.title,
      notes: patch.notes ?? task.notes,
      due: patch.due === undefined ? task.due : patch.due,
      rev: task.rev + 1,
    }
    const raw = buildMessage({ from: account.email, to: account.email, task: next })

    const created = await this.connection.run(async (client) => {
      const uid = await withFolder(client, task.folder, () => appendTask(client, task.folder, raw))
      const fresh = await withFolder(client, task.folder, () => this.fetchTaskByUid(client, task.folder, uid, { ...next, uid }))
      const trash = await findTrash(client)
      await withFolder(client, task.folder, () => deleteMail(client, task.folder, task.uid, trash))
      return fresh
    })

    this.forgetTask(task.folder, task.uid)
    this.upsertTask(task.folder, created)
    this.publish()
    await writeSnapshot(this.snapshot)
  }

  async removeTask(task: Task): Promise<void> {
    await this.connection.run(async (client) => {
      const trash = await findTrash(client)
      await withFolder(client, task.folder, () => deleteMail(client, task.folder, task.uid, trash))
    })
    this.forgetTask(task.folder, task.uid)
    this.publish()
    await writeSnapshot(this.snapshot)
  }

  async loadNotes(task: Task): Promise<string> {
    const notes = await this.connection.run((client) =>
      withFolder(client, task.folder, () => fetchBody(client, task.folder, task.uid)),
    )
    this.applyLocal(task.id, { notes })
    return notes
  }

  async addList(name: string): Promise<void> {
    await this.connection.run((client) => createList(client, name))
    await this.refresh()
  }

  async removeList(listPath: string): Promise<void> {
    await this.connection.run((client) => deleteList(client, listPath))
    delete this.snapshot.folders[listPath]
    this.tasks = this.tasks.filter((task) => task.folder !== listPath)
    await writeSnapshot(this.snapshot)
    await this.refresh()
  }

  defaultListPath(): string {
    return this.inboxPath ?? this.lists[0]?.path ?? ''
  }

  private applyLocal(id: string, patch: Partial<Task>): void {
    const apply = (task: Task): Task => (task.id === id ? { ...task, ...patch } : task)
    this.tasks = this.tasks.map(apply)
    for (const entry of Object.values(this.snapshot.folders)) {
      entry.tasks = entry.tasks.map(apply)
    }
    this.emit()
  }
}


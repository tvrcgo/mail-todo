import { contextBridge, ipcRenderer } from 'electron'

import { IPC } from '../shared/constants'
import type { MailboxState, Result, Settings, Task } from '../shared/types'

const invoke = <T>(channel: string, payload?: unknown): Promise<Result<T>> => ipcRenderer.invoke(channel, payload)

export interface TodoApi {
  getState(): Promise<MailboxState>
  getSettings(): Promise<Result<Settings>>
  saveSettings(input: Partial<Settings>): Promise<Result<Settings>>
  login(input: {
    provider: string
    email: string
    password: string
    imapHost?: string
    imapPort?: number
    secure?: boolean
  }): Promise<Result<MailboxState>>
  logout(): Promise<Result<MailboxState>>
  refresh(): Promise<Result<MailboxState>>
  createTask(input: { listPath: string | null; title: string; notes?: string; due?: string | null; important?: boolean }): Promise<Result<Task>>
  updateTask(input: { taskId: string; patch: { title?: string; notes?: string; due?: string | null } }): Promise<Result<MailboxState>>
  setDone(input: { taskId: string; done: boolean }): Promise<Result<MailboxState>>
  setImportant(input: { taskId: string; important: boolean }): Promise<Result<MailboxState>>
  deleteTask(input: { taskId: string }): Promise<Result<MailboxState>>
  loadNotes(input: { taskId: string }): Promise<Result<string>>
  createList(input: { name: string }): Promise<Result<MailboxState>>
  renameList(input: { path: string; name: string }): Promise<Result<MailboxState>>
  deleteList(input: { path: string }): Promise<Result<MailboxState>>
  setFocused(focused: boolean): void
  onChanged(callback: (state: MailboxState) => void): () => void
}

const api: TodoApi = {
  getState: () => ipcRenderer.invoke(IPC.state),
  getSettings: () => invoke<Settings>(IPC.settings),
  saveSettings: (input) => invoke<Settings>(IPC.saveSettings, input),
  login: (input) => invoke<MailboxState>(IPC.login, input),
  logout: () => invoke<MailboxState>(IPC.logout),
  refresh: () => invoke<MailboxState>(IPC.refresh),
  createTask: (input) => invoke<Task>(IPC.createTask, input),
  updateTask: (input) => invoke<MailboxState>(IPC.updateTask, input),
  setDone: (input) => invoke<MailboxState>(IPC.setDone, input),
  setImportant: (input) => invoke<MailboxState>(IPC.setImportant, input),
  deleteTask: (input) => invoke<MailboxState>(IPC.deleteTask, input),
  loadNotes: (input) => invoke<string>(IPC.loadNotes, input),
  createList: (input) => invoke<MailboxState>(IPC.createList, input),
  renameList: (input) => invoke<MailboxState>(IPC.renameList, input),
  deleteList: (input) => invoke<MailboxState>(IPC.deleteList, input),
  setFocused: (focused) => {
    void ipcRenderer.invoke(IPC.focus, focused)
  },
  onChanged: (callback) => {
    const handler = (_event: unknown, state: MailboxState) => callback(state)
    ipcRenderer.on(IPC.changed, handler)
    return () => {
      ipcRenderer.removeListener(IPC.changed, handler)
    }
  },
}

contextBridge.exposeInMainWorld('todo', api)

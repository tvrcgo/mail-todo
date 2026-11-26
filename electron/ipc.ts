import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC } from '../shared/constants'
import { findProvider } from '../shared/providers'
import type { Result, Settings } from '../shared/types'
import { clearAccount, loadSettings, saveAccount, saveSettings } from './config'
import { toMailError } from './mail/errors'
import type { Mailbox } from './mail/sync'

const loginSchema = z.object({
  provider: z.string().min(1),
  email: z.string().min(3),
  password: z.string().min(1),
  imapHost: z.string().optional(),
  imapPort: z.number().int().positive().optional(),
  secure: z.boolean().optional(),
})

const settingsSchema = z.object({
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  launchAtLogin: z.boolean().optional(),
  lastListPath: z.string().nullable().optional(),
})

const createTaskSchema = z.object({
  listPath: z.string().nullable(),
  title: z.string(),
  notes: z.string().optional(),
  due: z.string().nullable().optional(),
})

const taskIdSchema = z.object({ taskId: z.string().min(1) })
const patchSchema = z.object({
  taskId: z.string().min(1),
  patch: z.object({
    title: z.string().optional(),
    notes: z.string().optional(),
    due: z.string().nullable().optional(),
  }),
})

async function wrap<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (error) {
    const mailError = toMailError(error)
    return { ok: false, code: mailError.code, message: mailError.message }
  }
}

export function registerIpc(mailbox: Mailbox, onSettingsChanged: (settings: Settings) => void): void {
  ipcMain.handle(IPC.state, () => mailbox.getState())

  ipcMain.handle(IPC.settings, () => wrap(async () => (await loadSettings()) as Settings))

  ipcMain.handle(IPC.saveSettings, (_event, raw: unknown) =>
    wrap(async () => {
      const input = settingsSchema.parse(raw)
      const current = await loadSettings()
      const next: Settings = { ...current, ...input }
      await saveSettings(next)
      onSettingsChanged(next)
      return next
    }),
  )

  ipcMain.handle(IPC.login, (_event, raw: unknown) =>
    wrap(async () => {
      const input = loginSchema.parse(raw)
      const preset = findProvider(input.provider)
      const account = {
        provider: input.provider,
        email: input.email.trim(),
        password: input.password,
        imapHost: input.imapHost?.trim() || preset.imapHost,
        imapPort: input.imapPort ?? preset.imapPort,
        secure: input.secure ?? preset.secure,
        reminderTime: '09:00',
        launchAtLogin: false,
        lastListPath: null,
      }

      const settings = await loadSettings()
      await mailbox.verifyConnection(account)
      await saveAccount({ ...settings, ...account })
      await mailbox.start(account)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.logout, () =>
    wrap(async () => {
      await mailbox.stop()
      await clearAccount()
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.refresh, () => wrap(async () => mailbox.refresh().then(() => mailbox.getState())))

  ipcMain.handle(IPC.createTask, (_event, raw: unknown) =>
    wrap(async () => {
      const input = createTaskSchema.parse(raw)
      return mailbox.createTask(input.listPath, { title: input.title, notes: input.notes, due: input.due ?? null })
    }),
  )

  ipcMain.handle(IPC.updateTask, (_event, raw: unknown) =>
    wrap(async () => {
      const input = patchSchema.parse(raw)
      const task = mailbox.findTask(input.taskId)
      await mailbox.updateTask(task, input.patch)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.setDone, (_event, raw: unknown) =>
    wrap(async () => {
      const input = taskIdSchema.extend({ done: z.boolean() }).parse(raw)
      await mailbox.setDone(mailbox.findTask(input.taskId), input.done)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.setImportant, (_event, raw: unknown) =>
    wrap(async () => {
      const input = taskIdSchema.extend({ important: z.boolean() }).parse(raw)
      await mailbox.setImportant(mailbox.findTask(input.taskId), input.important)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.deleteTask, (_event, raw: unknown) =>
    wrap(async () => {
      const input = taskIdSchema.parse(raw)
      await mailbox.removeTask(mailbox.findTask(input.taskId))
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.loadNotes, (_event, raw: unknown) =>
    wrap(async () => {
      const input = taskIdSchema.parse(raw)
      return mailbox.loadNotes(mailbox.findTask(input.taskId))
    }),
  )

  ipcMain.handle(IPC.createList, (_event, raw: unknown) =>
    wrap(async () => {
      const input = z.object({ name: z.string().min(1) }).parse(raw)
      await mailbox.addList(input.name)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.deleteList, (_event, raw: unknown) =>
    wrap(async () => {
      const input = z.object({ path: z.string().min(1) }).parse(raw)
      await mailbox.removeList(input.path)
      return mailbox.getState()
    }),
  )

  ipcMain.handle(IPC.focus, (_event, focused: unknown) => {
    mailbox.setFocused(Boolean(focused))
  })
}


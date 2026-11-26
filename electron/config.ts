import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Settings } from '../shared/types'
import { MailError } from './mail/errors'

export interface AccountSettings extends Settings {
  password: string
}

const DEFAULT_SETTINGS: Settings = {
  provider: '163',
  email: '',
  imapHost: '',
  imapPort: 993,
  secure: true,
  reminderTime: '09:00',
  launchAtLogin: false,
  lastListPath: null,
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function credentialsPath(): string {
  return path.join(app.getPath('userData'), 'credentials.bin')
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

export async function loadAccount(): Promise<AccountSettings | null> {
  const settings = await loadSettings()
  if (!settings.email) return null
  try {
    const encrypted = await fs.readFile(credentialsPath())
    if (!safeStorage.isEncryptionAvailable()) {
      throw new MailError('NO_CRYPTO', '系统凭据加密不可用，无法读取已保存的授权码')
    }
    const password = safeStorage.decryptString(encrypted)
    return { ...settings, password }
  } catch (error) {
    if (error instanceof MailError) throw error
    return null
  }
}

export async function saveAccount(input: Settings & { password: string }): Promise<void> {
  const { password, ...settings } = input
  if (!safeStorage.isEncryptionAvailable()) {
    throw new MailError('NO_CRYPTO', '系统凭据加密不可用，已拒绝保存授权码')
  }
  await fs.mkdir(path.dirname(credentialsPath()), { recursive: true })
  await saveSettings(settings)
  await fs.writeFile(credentialsPath(), safeStorage.encryptString(password))
}

export async function clearAccount(): Promise<void> {
  await fs.rm(credentialsPath(), { force: true })
  const settings = await loadSettings()
  await saveSettings({ ...settings, email: '', imapHost: '', imapPort: 993 })
}

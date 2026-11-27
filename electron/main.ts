import { app, BrowserWindow, Menu, Notification, Tray, nativeImage } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { APP_NAME, IPC } from '../shared/constants'
import type { Settings } from '../shared/types'
import { loadAccount, loadSettings } from './config'
import { registerIpc } from './ipc'
import { Connection } from './mail/connection'
import { Mailbox } from './mail/sync'
import { dueForReminder, isReminderTime } from './reminder'

/** 应用改名为 Todo 后 userData 目录也变了，把旧的账号与快照搬过来，避免用户重新登录 */
function migrateUserData(): void {
  const target = app.getPath('userData')
  const legacy = path.join(app.getPath('appData'), 'MailTodo')
  if (target === legacy || existsSync(path.join(target, 'credentials.bin'))) return
  if (!existsSync(legacy)) return

  mkdirSync(target, { recursive: true })
  // Local State 里存着 safeStorage 的加密密钥，漏了它旧密文解不开
  for (const name of ['settings.json', 'credentials.bin', 'snapshot.json', 'Local State']) {
    const source = path.join(legacy, name)
    if (existsSync(source)) copyFileSync(source, path.join(target, name))
  }
}

migrateUserData()

const connection = new Connection(null)
const mailbox = new Mailbox(connection)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let settings: Settings = {
  provider: '163',
  email: '',
  imapHost: '',
  imapPort: 993,
  secure: true,
  reminderTime: '09:00',
  launchAtLogin: false,
  lastListPath: null,
}

function assetPath(name: string): string {
  return path.join(__dirname, '../../assets', name)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#FAF9F8',
    title: APP_NAME,
    icon: assetPath('icon.ico'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F3F2F1', symbolColor: '#2B2B2B', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('focus', () => mailbox.setFocused(true))
  mainWindow.on('blur', () => mailbox.setFocused(false))

  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(assetPath('tray.png'))
  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Todo', click: () => showWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => showWindow())
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function startReminderLoop(): void {
  setInterval(() => {
    if (!Notification.isSupported()) return
    if (!isReminderTime(new Date(), settings.reminderTime)) return

    const today = new Date().toLocaleDateString('sv-SE')
    const { tasks } = mailbox.getState()
    const notified = mailbox.notifiedSnapshot()
    const due = dueForReminder(tasks, today, notified)
    if (due.length === 0) return

    new Notification({
      title: `${due.length} 项任务今天到期`,
      body: due
        .slice(0, 5)
        .map((task) => task.title)
        .join('\n'),
    }).show()

    for (const task of due) notified[task.id] = today
    void mailbox.persist()
  }, 30_000)
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null)
  // 不设置的话 Windows 会把窗口归到 electron.exe 名下，任务栏显示 Electron 默认图标
  app.setAppUserModelId('com.todo.app')
  settings = await loadSettings()
  registerIpc(mailbox, (next) => {
    settings = next
    applySettings(next)
  })

  mailbox.onChange((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.changed, state)
    }
  })

  createWindow()
  createTray()
  applySettings(settings)
  startReminderLoop()

  const account = await loadAccount()
  if (account) {
    mailbox.start(account).catch(() => undefined)
  }
}

function applySettings(next: Settings): void {
  app.setLoginItemSettings({ openAtLogin: next.launchAtLogin })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(bootstrap)

  app.on('window-all-closed', () => {
    // 常驻托盘，不随窗口关闭退出
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('activate', () => showWindow())
}

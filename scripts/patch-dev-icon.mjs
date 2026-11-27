/**
 * 给开发模式用的 electron.exe 打上应用图标。
 *
 * 打包版不需要这一步：electron-builder 会按 package.json 的 build.win.icon 直接写入
 * Todo.exe。但 `npm run dev` 跑的是 node_modules/electron/dist/electron.exe，
 * Windows 的任务栏图标取自可执行文件本身，不处理就会显示 Electron 的默认图标。
 *
 * 重装依赖后需要重跑一次：npm run dev:icon（rcedit 已随仓库放在 scripts/bin 下）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, linkSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const DEV_ALIAS = 'electron-todo.exe'
const root = path.resolve(import.meta.dirname, '..')
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const icon = path.join(root, 'assets', 'icon.ico')

const candidates = [
  process.env.RCEDIT_PATH,
  path.join(root, 'scripts', 'bin', 'rcedit.exe'),
  path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
  path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit.exe'),
].filter(Boolean)

const rcedit = candidates.find((candidate) => existsSync(candidate))

if (!existsSync(electronExe)) {
  console.error(`找不到 electron.exe：${electronExe}，请先执行 npm install`)
  process.exit(1)
}

if (!rcedit) {
  console.error('找不到 rcedit，无法修改 exe 图标。')
  console.error('可设置环境变量 RCEDIT_PATH 指向 rcedit.exe 后重试。')
  process.exit(1)
}

execFileSync(rcedit, [electronExe, '--set-icon', icon], { stdio: 'inherit' })
console.log(`已为开发版 electron.exe 写入图标：${icon}`)

// Windows 会按"可执行文件路径"缓存任务栏图标，改完同名文件常常还是显示旧图标。
// 再建一个硬链接（同盘不占额外空间）给开发模式用，路径不同就不会命中旧缓存。
const aliasExe = path.join(path.dirname(electronExe), DEV_ALIAS)
if (existsSync(aliasExe)) unlinkSync(aliasExe)
linkSync(electronExe, aliasExe)
console.log(`已创建开发模式专用入口：${aliasExe}`)

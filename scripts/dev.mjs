import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import electron from 'electron'
import { createServer } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(root, '..')

const server = await createServer({ configFile: path.join(projectRoot, 'vite.config.ts') })
await server.listen()
const url = server.resolvedUrls?.local?.[0]

// 优先用打过图标补丁的专用入口，避免命中 Windows 对 electron.exe 路径的旧图标缓存
const aliasPath = path.join(path.dirname(electron), 'electron-mailtodo.exe')
const executable = existsSync(aliasPath) ? aliasPath : electron

const child = spawn(executable, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: url },
})

child.on('close', async () => {
  await server.close()
  process.exit(0)
})

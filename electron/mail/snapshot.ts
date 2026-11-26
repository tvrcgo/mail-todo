import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { SNAPSHOT_VERSION } from '../../shared/constants'
import type { Snapshot } from '../../shared/types'

function snapshotPath(): string {
  return path.join(app.getPath('userData'), 'snapshot.json')
}

export function emptySnapshot(account: string): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    account,
    inboxPath: null,
    lists: [],
    folders: {},
    notified: {},
    syncedAt: new Date(0).toISOString(),
  }
}

export async function readSnapshot(account: string): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(), 'utf8')
    const parsed = JSON.parse(raw) as Snapshot
    if (parsed.version !== SNAPSHOT_VERSION || parsed.account !== account) return null
    return {
      ...parsed,
      inboxPath: typeof parsed.inboxPath === 'string' ? parsed.inboxPath : null,
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
    }
  } catch {
    return null
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  const target = snapshotPath()
  const temporary = `${target}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(temporary, JSON.stringify(snapshot), 'utf8')
  await fs.rename(temporary, target)
}

export async function clearSnapshot(): Promise<void> {
  await fs.rm(snapshotPath(), { force: true })
}

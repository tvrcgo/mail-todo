import type { ImapFlow, ListResponse } from 'imapflow'

import { INBOX_PATH, LIST_PREFIX } from '../../shared/constants'
import type { ListInfo } from '../../shared/types'
import { MailError } from './errors'

const SPECIAL_USE = new Set(['\\Sent', '\\Drafts', '\\Trash', '\\Junk', '\\Spam', '\\All', '\\Archive', '\\Flagged'])
const ILLEGAL_NAME = /[/\\.]/

export interface FolderSet {
  /** 收件箱路径，顶部「任务」导航指向它 */
  inbox: string | null
  /** 用户自建的列表，对应 Todo- 前缀文件夹 */
  lists: ListInfo[]
}

export async function listFolders(client: ImapFlow): Promise<FolderSet> {
  const boxes: ListResponse[] = await client.list()

  const inbox = boxes.find((box) => box.path.toUpperCase() === INBOX_PATH)?.path ?? null
  const lists = boxes
    .filter((box) => box.path.startsWith(LIST_PREFIX))
    .filter((box) => !SPECIAL_USE.has(box.specialUse ?? ''))
    .map((box) => ({ path: box.path, name: box.path.slice(LIST_PREFIX.length) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  return { inbox, lists }
}

export async function findTrash(client: ImapFlow): Promise<string | null> {
  const boxes: ListResponse[] = await client.list()
  return boxes.find((box) => box.specialUse === '\\Trash')?.path ?? null
}

export function validateListName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new MailError('EMPTY_NAME', '列表名不能为空')

  if (ILLEGAL_NAME.test(trimmed)) throw new MailError('BAD_NAME', '列表名不能包含 / \ . 这些字符')
  if (trimmed.length > 40) throw new MailError('LONG_NAME', '列表名不能超过 40 个字符')
  return trimmed
}

export async function createList(client: ImapFlow, name: string): Promise<ListInfo> {
  const display = validateListName(name)
  const { lists } = await listFolders(client)
  if (lists.some((item) => item.name === display)) {
    throw new MailError('DUPLICATE_NAME', `已存在名为“${display}”的列表`)
  }
  const mailbox = LIST_PREFIX + display
  await client.mailboxCreate(mailbox)
  return { path: mailbox, name: display }
}

export async function deleteList(client: ImapFlow, listPath: string): Promise<void> {
  if (listPath.toUpperCase() === INBOX_PATH) {
    throw new MailError('NOT_A_LIST', '收件箱是默认列表，不能删除')
  }
  if (!listPath.startsWith(LIST_PREFIX)) {
    throw new MailError('NOT_A_LIST', '只能删除 Todo- 前缀的列表文件夹')
  }

  // 163 等服务端拒绝删除非空文件夹，先清空再删目录
  const lock = await client.getMailboxLock(listPath, { readOnly: false })
  try {
    const mailbox = client.mailbox
    if (mailbox && mailbox.exists > 0) {
      await client.messageDelete('1:*', { uid: false })
    }
  } finally {
    lock.release()
  }

  try {
    await client.mailboxDelete(listPath)
  } catch (error) {
    throw new MailError('DELETE_FAILED', `邮箱拒绝删除文件夹：${(error as Error).message}`)
  }
}

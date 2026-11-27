import { describe, expect, it } from 'vitest'

import { buildMessage, decodeMimeWords, groupByTaskId, normalizeDue, parseHeaders, parseTask } from '../../electron/mail/mapping'
import type { Task } from '../../shared/types'

function row(folder: string, uid: number, headers: string, flags: string[] = []) {
  return { folder, uid, headers, flags }
}

const baseHeaders = [
  'Subject: 写周报',
  'Date: Wed, 26 Nov 2026 10:00:00 +0800',
  'Message-ID: <abc@todo>',
  'X-Todo-Id: 11111111-1111-1111-1111-111111111111',
  'X-Todo-Rev: 3',
  'X-Todo-Due: 2026-11-30',
].join('\r\n')

describe('parseTask', () => {
  it('解析出完整任务', () => {
    const task = parseTask(row('Todo-工作', 12, baseHeaders, ['\\Seen', '\\Flagged']))
    expect(task).not.toBeNull()
    expect(task).toMatchObject({
      id: '11111111-1111-1111-1111-111111111111',
      rev: 3,
      folder: 'Todo-工作',
      uid: 12,
      title: '写周报',
      done: true,
      important: true,
      due: '2026-11-30',
      messageId: '<abc@todo>',
    })
  })

  it('缺少 X-Todo-Id 时回退 Message-ID', () => {
    const headers = 'Subject: 无标识\r\nMessage-ID: <fallback@todo>'
    const task = parseTask(row('Todo-任务', 1, headers))
    expect(task?.id).toBe('<fallback@todo>')
    expect(task?.rev).toBe(1)
  })

  it('两个标识都没有时返回 null', () => {
    expect(parseTask(row('Todo-任务', 1, 'Subject: 空'))).toBeNull()
  })

  it('空标题回退占位文案', () => {
    const task = parseTask(row('Todo-任务', 1, 'Subject:\r\nX-Todo-Id: x'))
    expect(task?.title).toBe('(无标题)')
  })

  it('解码 RFC2047 中文标题', () => {
    const headers = `Subject: =?UTF-8?B?${Buffer.from('会议纪要', 'utf8').toString('base64')}?=\r\nX-Todo-Id: x`
    expect(parseTask(row('Todo-任务', 1, headers))?.title).toBe('会议纪要')
  })

  it('保留未知的 X-Todo-* 头', () => {
    const headers = `${baseHeaders}\r\nX-Todo-Rrule: FREQ=WEEKLY`
    const task = parseTask(row('Todo-工作', 1, headers))
    expect(task?.extraHeaders).toEqual({ 'x-todo-rrule': 'FREQ=WEEKLY' })
  })

  it('不把已读旗标误判为重要', () => {
    const task = parseTask(row('Todo-工作', 1, baseHeaders, ['\\Seen']))
    expect(task?.done).toBe(true)
    expect(task?.important).toBe(false)
  })
})

describe('groupByTaskId', () => {
  const task = (id: string, rev: number, uid: number): Task => ({
    id,
    rev,
    folder: 'Todo-任务',
    uid,
    title: id,
    notes: '',
    done: false,
    important: false,
    due: null,
    createdAt: '',
    messageId: '',
    extraHeaders: {},
  })

  it('同一任务保留 Rev 最大者，其余标记为陈旧', () => {
    const result = groupByTaskId([task('a', 1, 1), task('a', 3, 2), task('b', 1, 3)])
    expect(result.tasks.map((t) => `${t.id}:${t.rev}`).sort()).toEqual(['a:3', 'b:1'])
    expect(result.stale.map((t) => t.uid)).toEqual([1])
  })

  it('等版本时保留先出现的一条', () => {
    const result = groupByTaskId([task('a', 2, 5), task('a', 2, 6)])
    expect(result.tasks[0].uid).toBe(5)
    expect(result.stale[0].uid).toBe(6)
  })
})

describe('buildMessage', () => {
  const task = {
    id: '22222222-2222-2222-2222-222222222222',
    rev: 1,
    title: '买咖啡豆',
    notes: '浅烘\n两包',
    due: '2026-12-01',
    messageId: '',
    extraHeaders: { 'x-todo-rrule': 'FREQ=WEEKLY' },
  }

  it('生成的头能被自己解析回来', () => {
    const raw = buildMessage({ from: 'me@163.com', to: 'me@163.com', task })
    const headerBlock = raw.split('\r\n\r\n')[0]
    const parsed = parseHeaders(headerBlock)

    expect(parsed.get('subject')).toBe('买咖啡豆')
    expect(parsed.get('x-todo-id')).toBe(task.id)
    expect(parsed.get('x-todo-rev')).toBe('1')
    expect(parsed.get('x-todo-due')).toBe('2026-12-01')
    expect(parsed.get('x-todo-rrule')).toBe('FREQ=WEEKLY')
  })

  it('正文按 base64 编码，换行不丢', () => {
    const raw = buildMessage({ from: 'me@163.com', to: 'me@163.com', task })
    const body = raw.split('\r\n\r\n')[1]
    const decoded = Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
    expect(decoded).toBe('浅烘\n两包')
  })

  it('没有 Message-ID 时用任务 Id 生成', () => {
    const raw = buildMessage({ from: 'a@b.c', to: 'a@b.c', task })
    expect(raw).toContain(`Message-ID: <${task.id}@todo>`)
  })

  it('保留既有 Message-ID，维持邮件会话', () => {
    const raw = buildMessage({ from: 'a@b.c', to: 'a@b.c', task: { ...task, messageId: '<keep@todo>' } })
    expect(raw).toContain('Message-ID: <keep@todo>')
  })

  it('不重复输出已知 X-Todo 头', () => {
    const raw = buildMessage({ from: 'a@b.c', to: 'a@b.c', task })
    expect(raw.match(/X-Todo-Id:/gi)).toHaveLength(1)
  })
})

describe('normalizeDue', () => {
  it.each([
    ['2026-11-30', '2026-11-30'],
    ['2026-11-30T09:00:00+08:00', '2026-11-30'],
    ['  2026-01-02  ', '2026-01-02'],
    ['', null],
    ['明天', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDue(input)).toBe(expected)
  })
})

describe('decodeMimeWords', () => {
  it('解码 Q 编码', () => {
    expect(decodeMimeWords('=?UTF-8?Q?=E4=BC=9A=E8=AE=AE?=')).toBe('会议')
  })

  it('保留无法解码的原样', () => {
    expect(decodeMimeWords('=?UTF-8?B?%%%?=')).toBe('=?UTF-8?B?%%%?=')
  })

  it('混合明文与编码段', () => {
    expect(decodeMimeWords('Re: =?UTF-8?Q?=E4=BC=9A?= ok')).toBe('Re: 会 ok')
  })
})

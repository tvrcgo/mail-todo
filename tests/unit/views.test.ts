import { describe, expect, it } from 'vitest'

import { formatDue, isOverdue, matchesQuery, sortActive, tasksForView, viewTitle } from '../../src/lib/views'
import type { Task } from '../../shared/types'

function make(partial: Partial<Task> & { id: string }): Task {
  return {
    id: partial.id,
    rev: 1,
    folder: partial.folder ?? 'Todo-任务',
    uid: partial.uid ?? 1,
    title: partial.title ?? partial.id,
    notes: partial.notes ?? '',
    done: partial.done ?? false,
    important: partial.important ?? false,
    due: partial.due ?? null,
    createdAt: partial.createdAt ?? '2026-11-01T00:00:00.000Z',
    messageId: '',
    extraHeaders: {},
  }
}

const today = '2026-11-26'

describe('tasksForView', () => {
  const tasks = [
    make({ id: 'yesterday', due: '2026-11-25' }),
    make({ id: 'today', due: today }),
    make({ id: 'future', due: '2026-12-01' }),
    make({ id: 'nodue' }),
    make({ id: 'doneToday', due: today, done: true }),
    make({ id: 'starred', important: true }),
    make({ id: 'other', folder: 'Todo-工作' }),
  ]

  it('今天视图只含今天及逾期，且已完成单独归组', () => {
    const { active, completed } = tasksForView(tasks, 'today', today)
    expect(active.map((t) => t.id)).toEqual(['yesterday', 'today'])
    expect(completed.map((t) => t.id)).toEqual(['doneToday'])
  })

  it('重要视图跨列表聚合', () => {
    const { active } = tasksForView(tasks, 'important', today)
    expect(active.map((t) => t.id)).toEqual(['starred'])
  })

  it('全部视图包含所有未完成', () => {
    const { active } = tasksForView(tasks, 'all', today)
    expect(active).toHaveLength(6)
  })

  it('列表视图按文件夹过滤', () => {
    const { active } = tasksForView(tasks, 'list:Todo-工作', today)
    expect(active.map((t) => t.id)).toEqual(['other'])
  })
})

describe('sortActive', () => {
  it('有截止日期的在前，按日期升序；无日期的按创建时间倒序垫底', () => {
    const sorted = sortActive([
      make({ id: 'none-old', createdAt: '2026-11-01T00:00:00.000Z' }),
      make({ id: 'late', due: '2026-12-05' }),
      make({ id: 'early', due: '2026-11-20' }),
      make({ id: 'none-new', createdAt: '2026-11-20T00:00:00.000Z' }),
    ])
    expect(sorted.map((t) => t.id)).toEqual(['early', 'late', 'none-new', 'none-old'])
  })
})

describe('isOverdue', () => {
  it('昨天的未完成算逾期', () => {
    expect(isOverdue(make({ id: 'a', due: '2026-11-25' }), today)).toBe(true)
  })

  it('今天到期不算逾期', () => {
    expect(isOverdue(make({ id: 'a', due: today }), today)).toBe(false)
  })
})

describe('matchesQuery', () => {
  it('匹配标题与备注，忽略大小写', () => {
    const task = make({ id: 'a', title: '写周报', notes: 'Weekly report' })
    expect(matchesQuery(task, '周报')).toBe(true)
    expect(matchesQuery(task, 'weekly')).toBe(true)
    expect(matchesQuery(task, '不存在')).toBe(false)
  })

  it('空查询不过滤', () => {
    expect(matchesQuery(make({ id: 'a' }), '   ')).toBe(true)
  })
})

describe('formatDue', () => {
  it.each([
    ['2026-11-26', '今天'],
    ['2026-11-27', '明天'],
    ['2026-11-25', '昨天'],
    ['2026-12-03', '12月3日'],
    ['2027-01-05', '2027年1月5日'],
  ])('%s → %s', (due, expected) => {
    expect(formatDue(due, today)).toBe(expected)
  })
})

describe('viewTitle', () => {
  it('列表视图使用列表名', () => {
    expect(viewTitle('list:Todo-工作', '工作')).toBe('工作')
    expect(viewTitle('today', null)).toBe('今天')
  })
})

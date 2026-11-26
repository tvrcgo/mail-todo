import { describe, expect, it } from 'vitest'

import { dueForReminder, isReminderTime } from '../../electron/reminder'
import type { Task } from '../../shared/types'

function make(id: string, due: string | null, done = false): Task {
  return {
    id,
    rev: 1,
    folder: 'Todo-任务',
    uid: 1,
    title: id,
    notes: '',
    done,
    important: false,
    due,
    createdAt: '2026-11-01T00:00:00.000Z',
    messageId: '',
    extraHeaders: {},
  }
}

const today = '2026-11-26'

describe('dueForReminder', () => {
  it('只挑今天及逾期、未完成、且今天没提醒过的任务', () => {
    const tasks = [
      make('overdue', '2026-11-20'),
      make('today', today),
      make('future', '2026-12-01'),
      make('nodate', null),
      make('done', today, true),
      make('already', today),
    ]
    const due = dueForReminder(tasks, today, { already: today })
    expect(due.map((task) => task.id)).toEqual(['overdue', 'today'])
  })

  it('昨天提醒过的今天会再提醒一次', () => {
    const tasks = [make('t', today)]
    expect(dueForReminder(tasks, today, { t: '2026-11-25' })).toHaveLength(1)
  })

  it('没有到期任务时返回空数组', () => {
    expect(dueForReminder([make('a', null)], today, {})).toEqual([])
  })
})

describe('isReminderTime', () => {
  it('命中设定时分', () => {
    expect(isReminderTime(new Date(2026, 10, 26, 9, 0), '09:00')).toBe(true)
  })

  it('分不同不触发', () => {
    expect(isReminderTime(new Date(2026, 10, 26, 9, 1), '09:00')).toBe(false)
  })

  it('时不同不触发', () => {
    expect(isReminderTime(new Date(2026, 10, 26, 10, 0), '09:00')).toBe(false)
  })
})

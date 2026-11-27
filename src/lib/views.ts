import type { Task, ViewId } from '../../shared/types'

export const TODAY_LABEL = '今天'

export function startOfToday(now = new Date()): string {
  return now.toLocaleDateString('sv-SE')
}

export function tasksForView(tasks: Task[], view: ViewId, today: string): TaskGroups {
  return groupTasks(tasks.filter((task) => inView(task, view, today)))
}

/** 跨列表检索：关键词为空时返回全部任务 */
export function searchTasks(tasks: Task[], query: string): TaskGroups {
  return groupTasks(tasks.filter((task) => matchesQuery(task, query)))
}

export interface TaskGroups {
  active: Task[]
  completed: Task[]
}

function groupTasks(tasks: Task[]): TaskGroups {
  return {
    active: sortActive(tasks.filter((task) => !task.done)),
    completed: tasks.filter((task) => task.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

export function inView(task: Task, view: ViewId, today: string): boolean {
  if (view === 'today') return task.due !== null && task.due <= today
  if (view === 'important') return task.important
  if (view === 'all') return true
  return task.folder === view.slice('list:'.length)
}

export function sortActive(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.due !== b.due) {
      if (a.due === null) return 1
      if (b.due === null) return -1
      return a.due.localeCompare(b.due)
    }
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function isOverdue(task: Task, today: string): boolean {
  return !task.done && task.due !== null && task.due < today
}

export function viewTitle(view: ViewId, listName: string | null): string {
  if (view === 'today') return TODAY_LABEL
  if (view === 'important') return '重要'
  if (view === 'all') return '任务'
  return listName ?? '列表'
}

export function matchesQuery(task: Task, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return task.title.toLowerCase().includes(needle) || task.notes.toLowerCase().includes(needle)
}

export function formatDue(due: string, today: string): string {
  if (due === today) return '今天'
  const [year, month, day] = due.split('-')
  const target = new Date(Number(year), Number(month) - 1, Number(day))
  const base = parseLocalDate(today)
  const diffDays = Math.round((target.getTime() - base.getTime()) / 86_400_000)

  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  if (diffDays < 0) {
    return `${target.getMonth() + 1}月${target.getDate()}日`
  }
  if (target.getFullYear() === base.getFullYear()) return `${Number(month)}月${Number(day)}日`
  return `${year}年${Number(month)}月${Number(day)}日`
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day)
}
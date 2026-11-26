import type { Task } from '../shared/types'

export function dueForReminder(tasks: Task[], today: string, notified: Record<string, string>): Task[] {
  return tasks.filter((task) => !task.done && task.due !== null && task.due <= today && notified[task.id] !== today)
}

export function isReminderTime(current: Date, reminderTime: string): boolean {
  const [hour, minute] = reminderTime.split(':').map((part) => Number.parseInt(part, 10))
  return current.getHours() === hour && current.getMinutes() === minute
}

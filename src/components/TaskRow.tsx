import type { Task } from '../../shared/types'
import { formatDue, isOverdue } from '../lib/views'
import { CalendarIcon, CheckIcon, StarIcon } from './Icons'

interface Props {
  task: Task
  today: string
  selected: boolean
  onSelect: () => void
  onToggleDone: () => void
  onToggleImportant: () => void
}

export function TaskRow({ task, today, selected, onSelect, onToggleDone, onToggleImportant }: Props) {
  const overdue = isOverdue(task, today)

  return (
    <li className={`task-row ${selected ? 'task-row--selected' : ''}`} onClick={onSelect}>
      <button
        className={`task-row__check ${task.done ? 'task-row__check--done' : ''}`}
        title={task.done ? '标为未完成' : '标为完成'}
        onClick={(event) => {
          event.stopPropagation()
          onToggleDone()
        }}
      >
        <CheckIcon size={12} />
      </button>

      <div className="task-row__body">
        <span className={`task-row__title ${task.done ? 'task-row__title--done' : ''}`}>{task.title}</span>
        {task.due ? (
          <span className={`task-row__due ${overdue ? 'task-row__due--overdue' : ''}`}>
            <CalendarIcon size={12} />
            {formatDue(task.due, today)}
          </span>
        ) : null}
      </div>

      <button
        className={`task-row__star ${task.important ? 'task-row__star--on' : ''}`}
        title={task.important ? '取消重要' : '标为重要'}
        onClick={(event) => {
          event.stopPropagation()
          onToggleImportant()
        }}
      >
        <StarIcon size={16} filled={task.important} />
      </button>
    </li>
  )
}

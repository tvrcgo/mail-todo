import { useEffect, useState } from 'react'

import type { Task } from '../../shared/types'
import { TaskRow } from './TaskRow'

interface Props {
  title: string
  active: Task[]
  completed: Task[]
  today: string
  query: string
  selectedId: string | null

  quickAdd: React.ReactNode
  canManageList: boolean

  onSelect: (task: Task) => void
  onToggleDone: (task: Task) => void
  onToggleImportant: (task: Task) => void
  onRenameList: () => void
  onDeleteList: () => void
}

export function TaskList({
  title,
  active,
  completed,
  today,
  query,
  selectedId,

  quickAdd,
  canManageList,

  onSelect,
  onToggleDone,
  onToggleImportant,
  onRenameList,
  onDeleteList,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  return (
    <section className="list-pane">
      <header className="list-pane__header">
        <h1 className="list-pane__title">{title}</h1>

        <div className="list-menu">
          <button
            className="icon-button list-menu__trigger"
            title="列表操作"
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen((value) => !value)
            }}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="list-menu__panel" onClick={(event) => event.stopPropagation()}>
              <button
                className="list-menu__item"
                disabled={!canManageList}
                onClick={() => {
                  setMenuOpen(false)
                  onRenameList()
                }}
              >
                重命名列表
              </button>
              <button
                className="list-menu__item list-menu__item--danger"
                disabled={!canManageList}
                onClick={() => {
                  setMenuOpen(false)
                  onDeleteList()
                }}
              >
                删除列表
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="list-pane__body">
        {active.length === 0 && completed.length === 0 ? (
          <div className="empty">
            <div className="empty__title">{query ? '没有匹配的任务' : '这里还空着'}</div>
            <div className="empty__hint">{query ? '换个关键词试试' : '在下方输入框写下第一件事，回车即可'}</div>
          </div>
        ) : (
          <ul className="task-list">
            {active.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                selected={task.id === selectedId}
                onSelect={() => onSelect(task)}
                onToggleDone={() => onToggleDone(task)}
                onToggleImportant={() => onToggleImportant(task)}
              />
            ))}
          </ul>
        )}

        {completed.length > 0 ? (
          <div className="completed">
            <button className="completed__toggle" onClick={() => setShowCompleted((value) => !value)}>
              {showCompleted ? '收起' : `已完成 ${completed.length}`}
            </button>
            {showCompleted ? (
              <ul className="task-list">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    selected={task.id === selectedId}
                    onSelect={() => onSelect(task)}
                    onToggleDone={() => onToggleDone(task)}
                    onToggleImportant={() => onToggleImportant(task)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {quickAdd}
    </section>
  )
}

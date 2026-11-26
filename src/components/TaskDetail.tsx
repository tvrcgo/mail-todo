import { useEffect, useRef, useState } from 'react'

import type { Task } from '../../shared/types'
import { formatDue } from '../lib/views'
import { CalendarIcon, CloseIcon, StarIcon, TrashIcon } from './Icons'

interface Props {
  task: Task
  today: string
  listName: string
  onClose: () => void
  onPatch: (patch: { title?: string; notes?: string; due?: string | null }) => void
  onToggleImportant: () => void
  onDelete: () => void
}

export function TaskDetail({ task, today, listName, onClose, onPatch, onToggleImportant, onDelete }: Props) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [due, setDue] = useState(task.due ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const loadedFor = useRef<string | null>(null)
  const saved = useRef({ title: task.title, notes: task.notes })
  const patchRef = useRef(onPatch)
  patchRef.current = onPatch

  useEffect(() => {
    setTitle(task.title)
    setDue(task.due ?? '')
    setConfirmDelete(false)
  }, [task.id, task.rev, task.title, task.due])

  useEffect(() => {
    saved.current = { title: task.title, notes: task.notes }
  }, [task.id, task.rev, task.title, task.notes])

  useEffect(() => {
    if (loadedFor.current === task.id) return
    loadedFor.current = task.id
    setLoadingNotes(true)
    setNotes('')
    void window.mailtodo.loadNotes({ taskId: task.id }).then((result) => {
      setLoadingNotes(false)
      if (result.ok) setNotes(result.data)
    })
  }, [task.id])

  const commitTitle = () => {
    const value = title.trim()
    if (!value || value === saved.current.title) return
    saved.current.title = value
    patchRef.current({ title: value })
  }

  const commitNotes = () => {
    if (notes === saved.current.notes) return
    saved.current.notes = notes
    patchRef.current({ notes })
  }

  const commitDue = (value: string) => {
    setDue(value)
    patchRef.current({ due: value || null })
  }

  // 输入停顿即自动保存，避免关掉面板丢掉编辑
  useEffect(() => {
    const value = title.trim()
    if (!value || value === saved.current.title) return
    const timer = setTimeout(() => {
      if (value === saved.current.title) return
      saved.current.title = value
      patchRef.current({ title: value })
    }, 700)
    return () => clearTimeout(timer)
  }, [title])

  useEffect(() => {
    if (notes === saved.current.notes) return
    const timer = setTimeout(() => {
      if (notes === saved.current.notes) return
      saved.current.notes = notes
      patchRef.current({ notes })
    }, 900)
    return () => clearTimeout(timer)
  }, [notes])

  return (
    <aside className="detail">
      <div className="detail__toolbar">
        <button
          className={`icon-button ${task.important ? 'icon-button--accent' : ''}`}
          title={task.important ? '取消重要' : '标为重要'}
          onClick={onToggleImportant}
        >
          <StarIcon size={18} filled={task.important} />
        </button>
        <button className="icon-button" title="关闭" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>

      <input
        className="detail__title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />

      <div className="detail__meta">
        <label className="detail__field">
          <CalendarIcon size={14} />
          <span>截止日期</span>
          <input type="date" value={due} onChange={(event) => commitDue(event.target.value)} />
        </label>
        {due ? <span className="detail__hint">{formatDue(due, today)}</span> : null}
        <div className="detail__field detail__field--static">
          <span>所在列表</span>
          <strong>{listName}</strong>
        </div>
      </div>

      <label className="detail__label">备注</label>
      <textarea
        className="detail__notes"
        placeholder={loadingNotes ? '读取邮件正文…' : '写下细节，会保存在这封邮件的正文里'}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={commitNotes}
      />

      <div className="detail__footer">
        {confirmDelete ? (
          <div className="detail__confirm">
            <span>任务会被移到邮箱的「已删除」</span>
            <button className="button button--danger" onClick={onDelete}>
              确认删除
            </button>
            <button className="button" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
          </div>
        ) : (
          <button className="button button--ghost" onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={14} />
            删除任务
          </button>
        )}
      </div>
    </aside>
  )
}

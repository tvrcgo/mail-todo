import { useState } from 'react'

import { CalendarIcon, PlusIcon } from './Icons'

interface Props {
  placeholder: string
  onAdd: (title: string, due: string | null) => void
}

export function QuickAdd({ placeholder, onAdd }: Props) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<string | null>(null)
  const [showDue, setShowDue] = useState(false)

  const submit = () => {
    const value = title.trim()
    if (!value) return
    onAdd(value, due)
    setTitle('')
    setDue(null)
    setShowDue(false)
  }

  return (
    <div className="quick-add">
      <PlusIcon size={18} className="quick-add__icon" />
      <input
        className="quick-add__input"
        placeholder={placeholder}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') {
            setTitle('')
            setShowDue(false)
          }
        }}
      />
      {showDue ? (
        <input
          className="quick-add__date"
          type="date"
          value={due ?? ''}
          onChange={(event) => setDue(event.target.value || null)}
        />
      ) : (
        <button className="icon-button" title="设置截止日期" onClick={() => setShowDue(true)}>
          <CalendarIcon size={16} />
        </button>
      )}
      {due ? <span className="quick-add__due">{due}</span> : null}
    </div>
  )
}

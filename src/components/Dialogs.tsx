import { useEffect, useRef, useState } from 'react'

interface InputDialogProps {
  title: string
  placeholder: string
  initialValue?: string
  confirmText: string
  onSubmit: (value: string) => void
  onClose: () => void
}

export function InputDialog({ title, placeholder, initialValue = '', confirmText, onSubmit, onClose }: InputDialogProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card modal__card--narrow" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          className="dialog-input"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
            if (event.key === 'Escape') onClose()
          }}
        />
        <div className="modal__actions modal__actions--end">
          <button className="button" onClick={onClose}>
            取消
          </button>
          <button className="button button--primary" disabled={!value.trim()} onClick={submit}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmText, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card modal__card--narrow" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="dialog-message">{message}</p>
        <div className="modal__actions modal__actions--end">
          <button className="button" onClick={onClose}>
            取消
          </button>
          <button
            className="button button--danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

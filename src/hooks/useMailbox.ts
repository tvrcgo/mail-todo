import { useCallback, useEffect, useRef, useState } from 'react'

import type { MailboxState, Result } from '../../shared/types'

const EMPTY: MailboxState = {
  status: { connected: false, email: null, error: null, syncing: false, lastSyncedAt: null },
  inboxPath: null,
  lists: [],
  tasks: [],
}

export function useMailbox() {
  const [state, setState] = useState<MailboxState>(EMPTY)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    void window.mailtodo.getState().then((next) => {
      if (!mounted.current) return
      setState(next)
      setReady(true)
    })

    const off = window.mailtodo.onChanged((next) => {
      if (mounted.current) setState(next)
    })

    const onFocus = () => window.mailtodo.setFocused(true)
    const onBlur = () => window.mailtodo.setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)

    return () => {
      mounted.current = false
      off()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const act = useCallback(async <T,>(promise: Promise<Result<T>>): Promise<T | null> => {
    const result = await promise
    if (result.ok) return result.data
    setError(result.message)
    return null
  }, [])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  return { state, ready, error, act, setError }
}

import { useCallback, useEffect, useState } from 'react'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 可拖拽的面板宽度。
 * direction=1 表示向右拖变宽（左侧栏），-1 表示向左拖变宽（右侧详情）。
 */
export function useResizable(storageKey: string, initialWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(() => {
    const raw = localStorage.getItem(storageKey)
    const parsed = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : initialWidth
  })

  useEffect(() => {
    localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  const startDrag = useCallback(
    (event: React.MouseEvent, direction: 1 | -1) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width

      document.body.classList.add('is-resizing')
      const onMove = (moveEvent: MouseEvent) => {
        setWidth(clamp(startWidth + (moveEvent.clientX - startX) * direction, min, max))
      }
      const onUp = () => {
        document.body.classList.remove('is-resizing')
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, min, max],
  )

  const reset = useCallback(() => setWidth(initialWidth), [initialWidth])

  return { width, startDrag, reset }
}

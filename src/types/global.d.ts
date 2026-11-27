import type { TodoApi } from '../../electron/preload'

declare global {
  interface Window {
    todo: TodoApi
  }
}

export {}

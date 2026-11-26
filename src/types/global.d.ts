import type { MailtodoApi } from '../../electron/preload'

declare global {
  interface Window {
    mailtodo: MailtodoApi
  }
}

export {}

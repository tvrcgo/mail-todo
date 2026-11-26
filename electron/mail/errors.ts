export class MailError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MailError'
  }
}

const FRIENDLY: Record<string, string> = {
  AUTHENTICATIONFAILED: '授权码或邮箱不正确',
  LOGIN_FAILED: '授权码或邮箱不正确',
  UNAVAILABLE: '邮箱服务器暂时不可用，请稍后重试',
  IMAP_NOT_ENABLED: '该邮箱未开启 IMAP 服务，请先在邮箱设置中开启',
  ETIMEDOUT: '连接邮箱服务器超时，请检查网络',
  ENOTFOUND: '找不到邮件服务器，请检查服务器地址',
  ECONNECTION: '无法连接邮件服务器，请检查网络与端口',
  ECONNREFUSED: '邮箱服务器拒绝连接，请检查服务器地址与端口',
  ENOENT: '邮箱中找不到该列表文件夹',
  NONEXISTENT: '邮箱中找不到该列表文件夹',
}

export function toMailError(error: unknown): MailError {
  if (error instanceof MailError) return error
  const code = (error as { code?: unknown })?.code
  const message = error instanceof Error ? error.message : String(error)
  const raw = message || (typeof code === 'string' ? code : '') || ''
  const key = Object.keys(FRIENDLY).find((item) => raw.toUpperCase().includes(item))
  if (key) return new MailError(key, FRIENDLY[key])
  return new MailError('MAIL_ERROR', raw || '邮箱操作失败，请稍后重试')
}

export interface ProviderPreset {
  id: string
  label: string
  imapHost: string
  imapPort: number
  secure: boolean
  hint: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: '163',
    label: '163 邮箱',
    imapHost: 'imap.163.com',
    imapPort: 993,
    secure: true,
    hint: '在「设置 → IMAP/SMTP 服务」开启并生成客户端授权码，用授权码而非登录密码',
  },
  {
    id: '126',
    label: '126 邮箱',
    imapHost: 'imap.126.com',
    imapPort: 993,
    secure: true,
    hint: '在「设置 → IMAP/SMTP 服务」开启并生成客户端授权码',
  },
  {
    id: 'icloud',
    label: 'iCloud 邮箱',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    secure: true,
    hint: '在 appleid.apple.com 生成「App 专用密码」，用它作为密码',
  },
  {
    id: 'custom',
    label: '其它 / 自建域名',
    imapHost: '',
    imapPort: 993,
    secure: true,
    hint: '填写邮箱服务商提供的 IMAP 服务器地址与端口，一般使用 993 + SSL',
  },
]

export function findProvider(id: string): ProviderPreset {
  return PROVIDERS.find((item) => item.id === id) ?? PROVIDERS[0]
}

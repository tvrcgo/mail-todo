import { useState } from 'react'

import { PROVIDERS, findProvider } from '../../shared/providers'
import logo from '../assets/logo.png'

interface Props {
  busy: boolean
  message: string | null
  onSubmit: (input: {
    provider: string
    email: string
    password: string
    imapHost?: string
    imapPort?: number
    secure?: boolean
  }) => void
}

export function Onboarding({ busy, message, onSubmit }: Props) {
  const [providerId, setProviderId] = useState('163')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('993')
  const [secure, setSecure] = useState(true)

  const preset = findProvider(providerId)
  const isCustom = providerId === 'custom'

  return (
    <div className="onboarding">
      <div className="onboarding__card">
        <div className="onboarding__brand">
          <img className="onboarding__logo" src={logo} alt="" />
          <div>
            <h1>MailTodo</h1>
            <p>用你自己的邮箱当待办后端</p>
          </div>
        </div>

        <p className="onboarding__lede">
          每条待办就是邮箱里的一封邮件：写一条就是写一封信，勾选完成就是标为已读，标为重要就是打上旗标，列表就是一个文件夹。
        </p>
        <p className="onboarding__warn">
          请使用一个专用邮箱：邮箱里凡是以 <code>Todo-</code> 开头的文件夹都会成为列表。
        </p>

        <label className="form-row">
          <span>邮箱类型</span>
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="form-hint">{preset.hint}</p>

        <label className="form-row">
          <span>邮箱地址</span>
          <input
            type="email"
            value={email}
            placeholder="you@163.com"
            autoComplete="username"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="form-row">
          <span>{providerId === 'icloud' ? 'App 专用密码' : '客户端授权码'}</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {isCustom ? (
          <>
            <label className="form-row">
              <span>IMAP 服务器</span>
              <input value={host} placeholder="imap.example.com" onChange={(event) => setHost(event.target.value)} />
            </label>
            <label className="form-row">
              <span>端口</span>
              <input value={port} onChange={(event) => setPort(event.target.value)} />
            </label>
            <label className="form-row form-row--inline">
              <input type="checkbox" checked={secure} onChange={(event) => setSecure(event.target.checked)} />
              <span>使用 SSL/TLS</span>
            </label>
          </>
        ) : null}

        {message ? <div className="onboarding__error">{message}</div> : null}

        <button
          className="button button--primary onboarding__submit"
          disabled={busy || !email.trim() || !password}
          onClick={() =>
            onSubmit({
              provider: providerId,
              email: email.trim(),
              password,
              imapHost: isCustom ? host.trim() : undefined,
              imapPort: isCustom ? Number(port) : undefined,
              secure: isCustom ? secure : undefined,
            })
          }
        >
          {busy ? '正在连接邮箱…' : '连接并开始'}
        </button>
      </div>
    </div>
  )
}

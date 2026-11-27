import { useEffect, useState } from 'react'

import { findProvider } from '../../shared/providers'
import type { Settings } from '../../shared/types'

interface Props {
  account: string
  onClose: () => void
  onSave: (patch: Partial<Settings>) => void
  onLogout: () => void
}

export function SettingsDialog({ account, onClose, onSave, onLogout }: Props) {
  const [reminderTime, setReminderTime] = useState('09:00')
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [server, setServer] = useState('')
  const [providerLabel, setProviderLabel] = useState('')

  useEffect(() => {
    void window.todo.getSettings().then((result) => {
      if (!result.ok) return
      setReminderTime(result.data.reminderTime)
      setLaunchAtLogin(result.data.launchAtLogin)
      setProviderLabel(findProvider(result.data.provider).label)
      setServer(`${result.data.imapHost}:${result.data.imapPort}`)
      setLoaded(true)
    })
  }, [])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>设置</h2>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal__body">
          <div className="setting-row">
            <span>当前邮箱</span>
            <strong>{account}</strong>
          </div>
          <div className="setting-row">
            <span>服务商</span>
            <strong>{providerLabel || '—'}</strong>
          </div>
          <div className="setting-row">
            <span>服务器</span>
            <strong>{server || '—'}</strong>
          </div>
          <p className="form-hint">所有任务都保存在这个邮箱里，换一台电脑登录同一邮箱即可继续。</p>

          <label className="setting-row">
            <span>每日提醒时间</span>
            <input
              type="time"
              value={reminderTime}
              disabled={!loaded}
              onChange={(event) => setReminderTime(event.target.value)}
            />
          </label>
          <p className="form-hint">到点后只对「今天到期且未完成」的任务弹一次系统通知。</p>

          <label className="setting-row setting-row--inline">
            <input
              type="checkbox"
              checked={launchAtLogin}
              disabled={!loaded}
              onChange={(event) => setLaunchAtLogin(event.target.checked)}
            />
            <span>开机自动启动</span>
          </label>

          <div className="modal__actions">
            <button
              className="button button--primary"
              onClick={() => {
                onSave({ reminderTime, launchAtLogin })
                onClose()
              }}
            >
              保存
            </button>
            <button
              className="button button--danger"
              onClick={() => {
                if (window.confirm('退出登录会清除本机保存的授权码，邮箱里的数据不受影响。继续吗？')) {
                  onLogout()
                  onClose()
                }
              }}
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

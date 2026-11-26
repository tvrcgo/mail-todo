import type { ListInfo, ViewId } from '../../shared/types'
import logo from '../assets/logo.png'
import { GearIcon, ListIcon, PlusIcon, StarIcon, SunIcon } from './Icons'

interface Props {
  view: ViewId
  inboxPath: string | null
  lists: ListInfo[]
  counts: Record<string, number>
  onSelect: (view: ViewId) => void
  onOpenSettings: () => void
  onCreateList: () => void
}

export function Sidebar({ view, inboxPath, lists, counts, onSelect, onOpenSettings, onCreateList }: Props) {
  const taskView: ViewId = inboxPath ? `list:${inboxPath}` : 'all'

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__logo" src={logo} alt="" />
        <div className="sidebar__name">MailTodo</div>
      </div>

      <nav className="sidebar__nav">
        <NavItem
          icon={<SunIcon />}
          label="今天"
          count={counts.today}
          active={view === 'today'}
          onClick={() => onSelect('today')}
        />
        <NavItem
          icon={<StarIcon />}
          label="重要"
          count={counts.important}
          active={view === 'important'}
          onClick={() => onSelect('important')}
        />
        <NavItem
          icon={<ListIcon />}
          label="任务"
          count={counts[taskView] ?? 0}
          active={view === taskView}
          onClick={() => onSelect(taskView)}
        />
      </nav>

      <div className="sidebar__section">
        <div className="sidebar__section-title">列表</div>
        <div className="sidebar__lists">
          {lists.map((list) => (
            <button
              key={list.path}
              className={`nav-item ${view === `list:${list.path}` ? 'nav-item--active' : ''}`}
              onClick={() => onSelect(`list:${list.path}`)}
            >
              <span className="nav-item__dot" />
              <span className="nav-item__label">{list.name}</span>
              {counts[`list:${list.path}`] ? <span className="nav-item__count">{counts[`list:${list.path}`]}</span> : null}
            </button>
          ))}
          {lists.length === 0 ? <div className="sidebar__hint">还没有列表，点右下角 + 新建</div> : null}
        </div>
      </div>

      <div className="sidebar__footer">
        <button className="nav-item sidebar__settings" onClick={onOpenSettings}>
          <GearIcon />
          <span className="nav-item__label">设置</span>
        </button>
        <button className="icon-button" title="新建列表" onClick={onCreateList}>
          <PlusIcon size={16} />
        </button>
      </div>
    </aside>
  )
}

interface NavItemProps {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function NavItem({ icon, label, count, active, onClick }: NavItemProps) {
  return (
    <button className={`nav-item ${active ? 'nav-item--active' : ''}`} onClick={onClick}>
      <span className="nav-item__icon">{icon}</span>
      <span className="nav-item__label">{label}</span>
      {count ? <span className="nav-item__count">{count}</span> : null}
    </button>
  )
}

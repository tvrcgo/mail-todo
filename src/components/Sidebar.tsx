import type { ListInfo, ViewId } from '../../shared/types'
import { GearIcon, InboxIcon, ListIcon, PlusIcon, SearchIcon, StarIcon, SunIcon } from './Icons'

interface Props {
  view: ViewId
  inboxPath: string | null
  lists: ListInfo[]
  counts: Record<string, number>
  query: string
  onQueryChange: (value: string) => void
  onSelect: (view: ViewId) => void
  onOpenSettings: () => void
  onCreateList: () => void
}

export function Sidebar({
  view,
  inboxPath,
  lists,
  counts,
  query,
  onQueryChange,
  onSelect,
  onOpenSettings,
  onCreateList,
}: Props) {
  const taskView: ViewId = inboxPath ? `list:${inboxPath}` : 'all'

  return (
    <aside className="sidebar">
      <label className="sidebar__search">
        <SearchIcon size={14} />
        <input value={query} placeholder="搜索所有任务" onChange={(event) => onQueryChange(event.target.value)} />
      </label>

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
          icon={<InboxIcon />}
          label="任务"
          count={counts[taskView] ?? 0}
          active={view === taskView}
          onClick={() => onSelect(taskView)}
        />
      </nav>

      <div className="sidebar__section">
        {lists.length > 0 ? <div className="sidebar__divider" /> : null}
        <div className="sidebar__lists">
          {lists.map((list) => (
            <button
              key={list.path}
              className={`nav-item ${view === `list:${list.path}` ? 'nav-item--active' : ''}`}
              onClick={() => onSelect(`list:${list.path}`)}
            >
              <span className="nav-item__icon">
                <ListIcon />
              </span>
              <span className="nav-item__label">{list.name}</span>
              {counts[`list:${list.path}`] ? <span className="nav-item__count">{counts[`list:${list.path}`]}</span> : null}
            </button>
          ))}
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

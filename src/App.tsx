import { useEffect, useMemo, useState } from 'react'

import type { Settings, Task, ViewId } from '../shared/types'
import { ConfirmDialog, InputDialog } from './components/Dialogs'
import { Onboarding } from './components/Onboarding'
import { QuickAdd } from './components/QuickAdd'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { TaskDetail } from './components/TaskDetail'
import { TaskList } from './components/TaskList'
import { useMailbox } from './hooks/useMailbox'
import { useResizable } from './hooks/useResizable'
import logo from './assets/logo.png'
import { searchTasks, startOfToday, tasksForView, viewTitle } from './lib/views'

export default function App() {
  const { state, ready, error, act } = useMailbox()
  const [view, setView] = useState<ViewId>('today')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [renamingList, setRenamingList] = useState(false)
  const [deletingList, setDeletingList] = useState(false)
  const sidebar = useResizable('todo.sidebarWidth', 260, 200, 420)
  const detail = useResizable('todo.detailWidth', 280, 240, 560)

  const today = startOfToday()
  const lists = state.lists
  const tasks = state.tasks

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && !selectedTask) setSelectedId(null)
  }, [selectedId, selectedTask])

  useEffect(() => {
    if (!selectedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const searching = query.trim().length > 0
  const visible = useMemo(
    () => (searching ? searchTasks(tasks, query) : tasksForView(tasks, view, today)),
    [tasks, view, today, query, searching],
  )

  const counts = useMemo(() => {
    const result: Record<string, number> = { today: 0, important: 0, all: 0 }
    for (const task of tasks) {
      if (task.done) continue
      result.all += 1
      if (task.due !== null && task.due <= today) result.today += 1
      if (task.important) result.important += 1
      result[`list:${task.folder}`] = (result[`list:${task.folder}`] ?? 0) + 1
    }
    return result
  }, [tasks, today])

  const currentListPath = view.startsWith('list:') ? view.slice('list:'.length) : null
  const inboxPath = state.inboxPath
  const currentListName = !currentListPath
    ? null
    : currentListPath === inboxPath
      ? '任务'
      : (lists.find((item) => item.path === currentListPath)?.name ?? null)

  const taskListName = (folder: string): string => {
    if (folder === inboxPath) return '任务'
    return lists.find((item) => item.path === folder)?.name ?? folder
  }

  const toggleDone = (task: Task) => {
    void act(window.todo.setDone({ taskId: task.id, done: !task.done }))
  }

  const toggleImportant = (task: Task) => {
    void act(window.todo.setImportant({ taskId: task.id, important: !task.important }))
  }

  const addTask = (title: string, due: string | null) => {
    const inTodayView = view === 'today'
    void act(
      window.todo.createTask({
        listPath: currentListPath,
        title,
        due: due ?? (inTodayView ? today : null),
        important: view === 'important' ? true : undefined,
      }),
    )
  }

  const savePatch = (task: Task, patch: { title?: string; notes?: string; due?: string | null }) => {
    void act(window.todo.updateTask({ taskId: task.id, patch }))
  }

  if (!ready) {
    return <div className="splash">正在启动…</div>
  }

  if (!state.status.email) {
    return (
      <Onboarding
        busy={busy}
        message={error}
        onSubmit={(input) => {
          setBusy(true)
          void act(window.todo.login(input)).finally(() => setBusy(false))
        }}
      />
    )
  }

  return (
    <div
      className="app"
      style={{ '--sidebar-w': `${sidebar.width}px`, '--detail-w': `${detail.width}px` } as React.CSSProperties}
    >
      <div className="titlebar">
        <img className="titlebar__icon" src={logo} alt="" />
        <span className="titlebar__title">Todo</span>
      </div>
      <Sidebar
        view={view}
        inboxPath={state.inboxPath}
        lists={lists}
        counts={counts}
        query={query}
        onQueryChange={setQuery}
        onSelect={(next) => {
          setView(next)
          setSelectedId(null)
          setQuery('')
        }}
        onOpenSettings={() => setShowSettings(true)}
        onCreateList={() => setCreatingList(true)}
      />

      <div
        className="resizer"
        title="拖动调整宽度，双击恢复默认"
        onMouseDown={(event) => sidebar.startDrag(event, 1)}
        onDoubleClick={sidebar.reset}
      />

      <div className="main">
        {state.status.error ? (
          <div className="banner banner--error">
            <span>{state.status.error}</span>
            <button className="button button--ghost" onClick={() => void act(window.todo.refresh())}>
              重试
            </button>
          </div>
        ) : null}

        <TaskList
          title={searching ? '搜索' : viewTitle(view, currentListName)}
          active={visible.active}
          completed={visible.completed}
          today={today}
          selectedId={selectedId}
          query={query}
          onSelect={(task) => setSelectedId(task.id)}
          onToggleDone={toggleDone}
          onToggleImportant={toggleImportant}
          canManageList={currentListPath !== null && currentListPath !== inboxPath}
          onRenameList={() => setRenamingList(true)}
          onDeleteList={() => setDeletingList(true)}
          quickAdd={<QuickAdd placeholder={`在「${viewTitle(view, currentListName)}」中添加任务`} onAdd={addTask} />}
        />

        {selectedTask ? (
          <div className="drawer-layer">
            <div className="drawer-scrim" onClick={() => setSelectedId(null)} />
            <div className="drawer" style={{ width: detail.width }}>
              <div
                className="resizer drawer__resizer"
                title="拖动调整宽度，双击恢复默认"
                onMouseDown={(event) => detail.startDrag(event, -1)}
                onDoubleClick={detail.reset}
              />
              <TaskDetail
                task={selectedTask}
                today={today}
                listName={taskListName(selectedTask.folder)}
                onClose={() => setSelectedId(null)}
                onPatch={(patch) => savePatch(selectedTask, patch)}
                onToggleImportant={() => toggleImportant(selectedTask)}
                onDelete={() => {
                  void act(window.todo.deleteTask({ taskId: selectedTask.id }))
                  setSelectedId(null)
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {showSettings ? (
        <SettingsDialog
          account={state.status.email}
          onClose={() => setShowSettings(false)}
          onSave={(patch: Partial<Settings>) => {
            void act(window.todo.saveSettings(patch))
          }}
          onLogout={() => {
            void act(window.todo.logout())
            setView('today')
            setSelectedId(null)
          }}
        />
      ) : null}

      {creatingList ? (
        <InputDialog
          title="新建列表"
          placeholder="列表名称"
          confirmText="创建"
          onClose={() => setCreatingList(false)}
          onSubmit={(name) => {
            void act(window.todo.createList({ name }))
          }}
        />
      ) : null}

      {renamingList && currentListPath && currentListName ? (
        <InputDialog
          title="重命名列表"
          placeholder="列表名称"
          initialValue={currentListName}
          confirmText="保存"
          onClose={() => setRenamingList(false)}
          onSubmit={(name) => {
            void (async () => {
              const next = await act(window.todo.renameList({ path: currentListPath, name }))
              const renamed = next?.lists.find((item) => item.name === name)
              if (renamed) setView(`list:${renamed.path}`)
            })()
          }}
        />
      ) : null}

      {deletingList && currentListPath && currentListName ? (
        <ConfirmDialog
          title="删除列表"
          message={`「${currentListName}」及其中的任务会从邮箱里一并删除，无法恢复。`}
          confirmText="删除"
          onClose={() => setDeletingList(false)}
          onConfirm={() => {
            void act(window.todo.deleteList({ path: currentListPath }))
            setView('all')
          }}
        />
      ) : null}

      {error ? <div className="toast">{error}</div> : null}
    </div>
  )
}

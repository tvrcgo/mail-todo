import { connect, waitFor } from './cdp.mjs'

const page = await connect()
const steps = []

function step(name, detail = '') {
  steps.push(`${name}${detail ? ' :: ' + detail : ''}`)
  console.log(`[PASS] ${name}${detail ? ' :: ' + detail : ''}`)
}

const SET_VALUE = `
(function setValue(selector, value) {
  const el = document.querySelector(selector)
  if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  el.focus()
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})
`

const getState = async () => JSON.parse(await page.evaluate('window.todo.getState().then((s) => JSON.stringify(s))'))
const q = (expr) => page.evaluate(expr)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const today = new Date().toLocaleDateString('sv-SE')
const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE')

const clickNav = (label) =>
  q(`(() => {
    const item = [...document.querySelectorAll('.sidebar__nav .nav-item')].find(b => b.textContent.includes('${label}'))
    if (!item) return false
    item.click()
    return true
  })()`)

const clickList = async (name) => {
  const clicked = await q(`(() => {
    const item = [...document.querySelectorAll('.sidebar__lists .nav-item')].find(b => b.textContent.includes('${name}'))
    if (!item) return false
    item.click()
    return true
  })()`)
  if (!clicked) throw new Error(`侧栏里找不到列表：${name}`)
}

async function openListMenu() {
  if (await q(`!!document.querySelector('.list-menu__panel')`)) return
  await q(`document.querySelector('.list-menu__trigger').click()`)
  await waitFor(async () => q(`!!document.querySelector('.list-menu__panel')`), { label: '列表操作菜单' })
}

// 用例会产生若干固定标题的任务，按标题全删，保证可重复运行
const FIXTURE_TITLES = [
  '今天新建的',
  '今天手选日期的',
  '重要新建的',
  '只在工作列表里的任务',
  '普通新建的',
  '重命名要保留的任务',
  '改名后新增的任务',
]

async function deleteFixtures() {
  const leftovers = (await getState()).tasks.filter((task) => FIXTURE_TITLES.includes(task.title))
  for (const task of leftovers) {
    await q(`window.todo.deleteTask({ taskId: ${JSON.stringify(task.id)} })`)
  }
  if (leftovers.length > 0) {
    await waitFor(
      async () => (await getState()).tasks.every((task) => !FIXTURE_TITLES.includes(task.title)),
      { label: '清理同名用例任务', timeout: 60000 },
    )
  }
}

async function setSearch(text) {
  await q(`(() => { const el = document.querySelector('.sidebar__search input'); el.focus(); el.select() })()`)
  if (text) {
    await page.send('Input.insertText', { text })
  } else {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 8, key: 'Backspace' })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, key: 'Backspace' })
  }
  await waitFor(async () => (await q(`document.querySelector('.sidebar__search input').value`)) === text, {
    label: `搜索框值为「${text}」`,
  })
}

async function addTask(title, due) {
  if (due) {
    await q(`document.querySelector('.quick-add button[title="设置截止日期"]')?.click()`)
    await waitFor(async () => q(`!!document.querySelector('.quick-add__date')`), { label: '展开日期输入' })
    await q(`${SET_VALUE}('.quick-add__date', '${due}')`)
  }
  await q(`${SET_VALUE}('.quick-add__input', ${JSON.stringify(title)})`)
  await q(`document.querySelector('.quick-add__input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
}

try {
  await waitFor(async () => q(`!!document.querySelector('.app')`), { label: '主界面', timeout: 30000 })
  step('主界面已就绪')

  await deleteFixtures()

  // 清理上一轮遗留的列表
  for (const leftover of (await getState()).lists.filter((item) => ['工作', '改名前', '改名后'].includes(item.name))) {
    await q(`window.todo.deleteList({ path: ${JSON.stringify(leftover.path)} })`)
    await waitFor(async () => !(await getState()).lists.some((item) => item.name === leftover.name), {
      label: `清理遗留列表 ${leftover.name}`,
      timeout: 40000,
    })
  }

  const existing = (await getState()).lists.find((list) => list.name === '工作')
  if (existing) {
    await q(`window.todo.deleteList({ path: ${JSON.stringify(existing.path)} })`)
    await waitFor(async () => !(await getState()).lists.some((list) => list.name === '工作'), { label: '清理遗留列表' })
    step('清理上一轮遗留列表')
  }

  // 新建列表：入口在侧栏底部的 + 号
  await q(`document.querySelector('.sidebar__footer .icon-button').click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '新建列表对话框' })
  await q(`${SET_VALUE}('.dialog-input', '工作')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '创建').click()`)

  const created = await waitFor(
    async () => {
      const state = await getState()
      return state.lists.find((list) => list.name === '工作') ?? null
    },
    { label: '列表创建并同步', timeout: 40000 },
  )
  step('新建列表「工作」', `邮箱文件夹 = ${created.path}`)

  // 非法名称
  await q(`document.querySelector('.sidebar__footer .icon-button').click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '新建列表对话框' })
  await q(`${SET_VALUE}('.dialog-input', 'a/b')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '创建').click()`)

  const rejected = await waitFor(
    async () => {
      const toast = await q(`document.querySelector('.toast')?.textContent ?? null`)
      return toast && toast.includes('不能包含') ? toast : null
    },
    { label: '非法名称被拒绝', timeout: 15000 },
  )
  if ((await getState()).lists.some((list) => list.name === 'a/b')) throw new Error('非法名称竟然创建成功了')
  step('非法列表名被拒绝', rejected)


  // 在该列表下建两条任务（一条今天到期，一条昨天到期）
  await clickList('工作')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '工作'`), { label: '进入工作列表' })

  await addTask('周会纪要', today)
  await waitFor(async () => (await getState()).tasks.some((task) => task.title === '周会纪要'), { label: '任务1 写入', timeout: 40000 })
  step('在列表内新建任务', `截止 ${today}`)

  await addTask('补交报销', yesterday)
  await waitFor(async () => (await getState()).tasks.some((task) => task.title === '补交报销'), { label: '任务2 写入', timeout: 40000 })
  step('新建逾期任务', `截止 ${yesterday}`)

  // 今天视图：两条都应出现，逾期的标红
  await clickNav('今天')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '今天'`), { label: '进入今天视图' })

  const todayView = await q(`JSON.stringify({
    titles: [...document.querySelectorAll('.task-row__title')].map(e => e.textContent),
    overdue: [...document.querySelectorAll('.task-row__due--overdue')].map(e => e.textContent.trim()),
  })`)
  const parsed = JSON.parse(todayView)
  if (!parsed.titles.includes('周会纪要') || !parsed.titles.includes('补交报销')) {
    throw new Error(`今天视图缺任务：${todayView}`)
  }
  if (!parsed.overdue.some((text) => text.includes('昨天'))) {
    throw new Error(`逾期任务没有标红：${todayView}`)
  }
  step('今天视图聚合与逾期标红', todayView)

  // 搜索：入口在侧栏顶部
  await setSearch('报销')
  await waitFor(
    async () => {
      const titles = await q(`JSON.stringify([...document.querySelectorAll('.task-row__title')].map(e => e.textContent))`)
      const list = JSON.parse(titles)
      return list.length === 1 && list[0] === '补交报销'
    },
    { label: '搜索过滤', timeout: 10000 },
  )
  step('本地搜索过滤', '只剩「补交报销」')

  await setSearch('')

  // 搜索是跨列表的：先在工作列表放一条无截止的任务，再回到今天视图搜它
  await clickList('工作')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '工作'`), { label: '回到工作列表' })
  await addTask('只在工作列表里的任务')
  await waitFor(async () => (await getState()).tasks.some((task) => task.title === '只在工作列表里的任务'), {
    label: '跨列表搜索用的任务写入',
    timeout: 40000,
  })

  await clickNav('今天')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '今天'`), { label: '进入今天视图' })
  const todayBeforeSearch = await q(`document.querySelector('.list-pane__title')?.textContent`)

  await setSearch('只在工作')
  const searched = await waitFor(
    async () => {
      const rows = JSON.parse(await q(`JSON.stringify([...document.querySelectorAll('.task-row__title')].map(e => e.textContent))`))
      return rows.includes('只在工作列表里的任务') ? rows : null
    },
    { label: '跨列表搜索命中', timeout: 15000 },
  )
  if (searched.length !== 1) throw new Error(`跨列表搜索结果异常：${JSON.stringify(searched)}`)
  const searchTitle = await q(`document.querySelector('.list-pane__title')?.textContent`)
  if (searchTitle !== '搜索') throw new Error(`搜索态标题应为「搜索」，实际 ${searchTitle}`)
  step('搜索跨列表', `在「今天」视图搜到工作列表的任务，标题「${searchTitle}」`)

  await setSearch('')
  const backTitle = await waitFor(
    async () => {
      const title = await q(`document.querySelector('.list-pane__title')?.textContent ?? null`)
      return title === todayBeforeSearch ? title : null
    },
    { label: '清空搜索回到原视图', timeout: 10000 },
  )
  step('清空关键词回到原视图', backTitle)

  // ---------- 视图新建标记 ----------
  const findTask = async (title) => (await getState()).tasks.find((task) => task.title === title) ?? null

  await clickNav('今天')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '今天'`), { label: '进入今天视图' })
  await addTask('今天新建的')
  const todayTask = await waitFor(
    async () => {
      const task = await findTask('今天新建的')
      return task && task.due === today ? task : null
    },
    { label: '今天视图新建带截止', timeout: 40000 },
  )
  if (todayTask.important) throw new Error('今天视图新建不该带重要标记')
  step('今天视图新建 → 截止为今天', `due=${todayTask.due}`)

  const in3days = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('sv-SE')
  await addTask('今天手选日期的', in3days)
  const pickedTask = await waitFor(
    async () => {
      const task = await findTask('今天手选日期的')
      return task && task.due === in3days ? task : null
    },
    { label: '手选日期优先', timeout: 40000 },
  )
  step('今天视图手选日期优先', `due=${pickedTask.due}（期望 ${in3days}）`)

  await clickNav('重要')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '重要'`), { label: '进入重要视图' })
  await addTask('重要新建的')
  const importantTask = await waitFor(
    async () => {
      const task = await findTask('重要新建的')
      return task && task.important ? task : null
    },
    { label: '重要视图新建带标记', timeout: 40000 },
  )
  if (importantTask.due !== null) throw new Error(`重要视图新建不该自带截止：${importantTask.due}`)
  const importantShown = await waitFor(
    async () => (await q(`JSON.stringify([...document.querySelectorAll('.task-row__title')].map(e => e.textContent))`)).includes('重要新建的'),
    { label: '重要视图可见', timeout: 10000 },
  )
  step('重要视图新建 → 带重要标记', `important=${importantTask.important}`)

  await clickList('工作')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '工作'`), { label: '回到工作列表' })
  await addTask('普通新建的')
  const plainTask = await waitFor(
    async () => {
      const task = await findTask('普通新建的')
      return task && task.folder === 'Todo-工作' ? task : null
    },
    { label: '普通列表新建', timeout: 40000 },
  )
  if (plainTask.due !== null || plainTask.important) {
    throw new Error(`普通列表新建带了标记：due=${plainTask.due} important=${plainTask.important}`)
  }
  step('普通列表新建无附加标记', `due=null important=false`)

  // 截图
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(new URL('./_ui.png', import.meta.url), Buffer.from(shot.data, 'base64'))

  // ---------- 重命名列表 ----------
  await q(`document.querySelector('.sidebar__footer .icon-button').click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '新建列表对话框' })
  await q(`${SET_VALUE}('.dialog-input', '改名前')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '创建').click()`)
  const beforeRename = await waitFor(
    async () => (await getState()).lists.find((list) => list.name === '改名前') ?? null,
    { label: '改名用列表创建', timeout: 40000 },
  )

  await waitFor(async () => q(`[...document.querySelectorAll('.sidebar__lists .nav-item')].some(b => b.textContent.includes('改名前'))`), {
    label: '侧栏出现改名前',
    timeout: 20000,
  })
  await clickList('改名前')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '改名前'`), { label: '进入改名前列表' })
  await addTask('重命名要保留的任务')
  await waitFor(async () => (await getState()).tasks.some((task) => task.title === '重命名要保留的任务'), {
    label: '改名用任务写入',
    timeout: 40000,
  })
  // 先标重要（行不移动），再勾完成（行会移入已完成区）
  await q(`document.querySelector('.task-row__star').click()`)
  await waitFor(
    async () => {
      const task = (await getState()).tasks.find((item) => item.title === '重命名要保留的任务')
      return task?.important ? task : null
    },
    { label: '任务标为重要', timeout: 30000 },
  )
  await q(`document.querySelector('.task-row__check').click()`)
  await waitFor(
    async () => {
      const task = (await getState()).tasks.find((item) => item.title === '重命名要保留的任务')
      return task && task.done && task.important ? task : null
    },
    { label: '任务标记完成与重要', timeout: 30000 },
  )

  await openListMenu()
  await q(`[...document.querySelectorAll('.list-menu__item')].find(b => b.textContent.includes('重命名列表')).click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '重命名对话框' })
  const prefilled = await q(`document.querySelector('.dialog-input').value`)
  if (prefilled !== '改名前') throw new Error(`对话框没有预填当前名字：${prefilled}`)
  await q(`${SET_VALUE}('.dialog-input', '改名后')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '保存').click()`)

  const renamed = await waitFor(
    async () => {
      const state = await getState()
      const target = state.lists.find((list) => list.name === '改名后')
      return target && !state.lists.some((list) => list.name === '改名前') ? target : null
    },
    { label: '列表重命名完成', timeout: 40000 },
  )
  step('重命名列表', `${beforeRename.path} → ${renamed.path}`)

  const kept = (await getState()).tasks.find((task) => task.title === '重命名要保留的任务')
  if (!kept) throw new Error('重命名后任务丢失')
  if (!kept.done || !kept.important) throw new Error(`重命名后状态丢失：done=${kept.done} important=${kept.important}`)
  if (kept.folder !== renamed.path) throw new Error(`任务仍指向旧文件夹：${kept.folder}`)
  step('重命名后任务与状态保留', `done=${kept.done} important=${kept.important} folder=${kept.folder}`)

  const titleAfterRename = await waitFor(
    async () => {
      const title = await q(`document.querySelector('.list-pane__title')?.textContent ?? null`)
      return title === '改名后' ? title : null
    },
    { label: '视图切到新列表', timeout: 10000 },
  )
  step('重命名后视图跟随新路径', titleAfterRename)

  // 改名后继续写入，落点应是新文件夹
  await addTask('改名后新增的任务')
  const written = await waitFor(
    async () => {
      const task = (await getState()).tasks.find((item) => item.title === '改名后新增的任务')
      return task && task.folder === renamed.path ? task : null
    },
    { label: '改名后新建任务落点', timeout: 40000 },
  )
  step('改名后继续写入', `落点 ${written.folder}`)

  // 重名被拒
  await openListMenu()
  await q(`[...document.querySelectorAll('.list-menu__item')].find(b => b.textContent.includes('重命名列表')).click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '重命名对话框' })
  await q(`${SET_VALUE}('.dialog-input', '工作')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '保存').click()`)
  const duplicate = await waitFor(
    async () => {
      const toast = await q(`document.querySelector('.toast')?.textContent ?? null`)
      return toast && toast.includes('已存在') ? toast : null
    },
    { label: '重名被拒绝', timeout: 15000 },
  )
  const stillTwo = (await getState()).lists.map((list) => list.name).sort().join(',')
  if (!stillTwo.includes('改名后') || !stillTwo.includes('工作')) throw new Error(`重名后列表异常：${stillTwo}`)
  step('重命名的重名被拒绝', duplicate)

  // 非法字符
  await openListMenu()
  await q(`[...document.querySelectorAll('.list-menu__item')].find(b => b.textContent.includes('重命名列表')).click()`)
  await waitFor(async () => q(`!!document.querySelector('.dialog-input')`), { label: '重命名对话框' })
  await q(`${SET_VALUE}('.dialog-input', 'a/b')`)
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '保存').click()`)
  const badName = await waitFor(
    async () => {
      const toast = await q(`document.querySelector('.toast')?.textContent ?? null`)
      return toast && toast.includes('不能包含') ? toast : null
    },
    { label: '非法改名被拒绝', timeout: 15000 },
  )
  step('重命名的非法字符被拒绝', badName)

  // 收件箱不可改名
  await clickNav('任务')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '任务'`), { label: '进入任务视图' })
  await openListMenu()
  const menuState = JSON.parse(
    await q(`JSON.stringify([...document.querySelectorAll('.list-menu__item')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })))`),
  )
  if (!menuState.every((item) => item.disabled)) throw new Error(`收件箱菜单未禁用：${JSON.stringify(menuState)}`)
  step('收件箱不可改名', JSON.stringify(menuState))
  await q(`document.querySelector('.list-menu__trigger').click()`)

  // 导航与列表图标
  const icons = JSON.parse(
    await q(`JSON.stringify({
      navInbox: document.querySelectorAll('.sidebar__nav .nav-item')[2].querySelector('svg')?.innerHTML.includes('<rect') ?? false,
      listHasIcon: !!document.querySelector('.sidebar__lists .nav-item svg'),
      dotGone: !document.querySelector('.nav-item__dot'),
    })`),
  )
  if (!icons.navInbox) throw new Error('「任务」没有用收件箱图标')
  if (!icons.listHasIcon) throw new Error('列表项没有图标')
  if (!icons.dotGone) throw new Error('列表项仍在用圆点')
  step('导航与列表图标', JSON.stringify(icons))

  // 清理改名相关数据
  for (const item of (await getState()).lists.filter((list) => list.name === '改名后')) {
    await q(`window.todo.deleteList({ path: ${JSON.stringify(item.path)} })`)
    await waitFor(async () => !(await getState()).lists.some((list) => list.name === '改名后'), {
      label: '清理改名列表',
      timeout: 40000,
    })
  }
  step('清理改名用例数据')

  // ---------- 布局与圆角 ----------
  const shell = JSON.parse(
    await q(`JSON.stringify({
      firstChild: document.querySelector('.sidebar').firstElementChild?.className ?? '',
      brand: !!document.querySelector('.sidebar__brand'),
      paneSearch: !!document.querySelector('.list-pane__search'),
      titleIcon: !!document.querySelector('.titlebar__icon'),
      titleName: document.querySelector('.titlebar__title')?.textContent ?? null,
      titleDrag: getComputedStyle(document.querySelector('.titlebar')).webkitAppRegion,
    })`),
  )
  if (shell.firstChild !== 'sidebar__search') throw new Error(`侧栏首元素不是搜索框：${shell.firstChild}`)
  if (shell.brand) throw new Error('侧栏仍在显示 logo 与名称')
  if (shell.paneSearch) throw new Error('任务区标题行仍有搜索框')
  if (!shell.titleIcon || shell.titleName !== 'Todo') throw new Error(`标题栏缺少图标或名称：${JSON.stringify(shell)}`)
  if (shell.titleDrag !== 'drag') throw new Error(`标题栏不可拖拽：${shell.titleDrag}`)
  step('侧栏与标题栏结构', `首元素 ${shell.firstChild}，标题栏「${shell.titleName}」可拖拽`)

  // 抽屉默认宽度
  await q(`(() => { const row = document.querySelector('.task-row'); if (row) row.click() })()`)
  await waitFor(async () => q(`!!document.querySelector('.drawer')`), { label: '抽屉打开' })
  await q(`(() => { const rs = document.querySelectorAll('.resizer'); rs[rs.length - 1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })()`)
  const drawerWidth = await waitFor(
    async () => {
      const value = await q(`Math.round(document.querySelector('.drawer').getBoundingClientRect().width)`)
      return value === 280 ? value : null
    },
    { label: '抽屉默认宽度 280', timeout: 5000 },
  )
  await q(`document.querySelector('.drawer-scrim')?.click()`)
  await waitFor(async () => !(await q(`!!document.querySelector('.drawer')`)), { label: '关闭抽屉' })
  step('抽屉默认宽度', String(drawerWidth))
  const dividerShown = await q(`!!document.querySelector('.sidebar__divider')`)
  if (!dividerShown) throw new Error('有列表时缺少分隔线')
  const sectionTitleGone = await q(`!document.querySelector('.sidebar__section-title')`)
  if (!sectionTitleGone) throw new Error('「列表」标题仍在')
  step('侧栏分隔线', `有列表时分隔线存在，标题已移除`)

  const radius = JSON.parse(
    await q(`JSON.stringify({
      quickAdd: getComputedStyle(document.querySelector('.quick-add')).borderRadius,
      navItem: getComputedStyle(document.querySelector('.nav-item')).borderRadius,
    })`),
  )
  if (radius.quickAdd !== '4px' || radius.navItem !== '4px') throw new Error(`控件圆角不是 4px：${JSON.stringify(radius)}`)
  await q(`document.querySelector('.sidebar__footer .icon-button').click()`)
  await waitFor(async () => q(`!!document.querySelector('.modal__card')`), { label: '弹出对话框' })
  const modalRadius = await q(`getComputedStyle(document.querySelector('.modal__card')).borderRadius`)
  await q(`document.querySelector('.modal')?.click()`)
  await waitFor(async () => !(await q(`!!document.querySelector('.modal')`)), { label: '关闭对话框' })
  if (modalRadius !== '8px') throw new Error(`弹窗圆角不是 8px：${modalRadius}`)
  step('圆角对齐 Material', `控件 ${radius.quickAdd} / 弹窗 ${modalRadius}`)

  // 输入框贴底：底边间距与左右一致，且滚动不移动
  await clickList('工作')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '工作'`), { label: '回到工作列表' })
  const gapBefore = JSON.parse(
    await q(`(() => {
      const b = document.querySelector('.quick-add').getBoundingClientRect()
      return JSON.stringify({ bottom: Math.round(window.innerHeight - b.bottom), left: Math.round(b.left) })
    })()`),
  )
  await q(`(() => { const body = document.querySelector('.list-pane__body'); if (body) body.scrollTop = body.scrollHeight })()`)
  await wait(200)
  const gapAfter = JSON.parse(
    await q(`(() => {
      const b = document.querySelector('.quick-add').getBoundingClientRect()
      return JSON.stringify({ bottom: Math.round(window.innerHeight - b.bottom), left: Math.round(b.left) })
    })()`),
  )
  const paneLeft = await q(`Math.round(document.querySelector('.list-pane').getBoundingClientRect().left)`)
  if (gapBefore.bottom !== gapAfter.bottom) throw new Error(`滚动后输入框位置变化：${gapBefore.bottom} → ${gapAfter.bottom}`)
  if (gapBefore.bottom !== gapBefore.left - paneLeft) {
    throw new Error(`底边间距与左右不一致：bottom=${gapBefore.bottom} left=${gapBefore.left - paneLeft}`)
  }
  step('输入框贴底且间距一致', `距底 ${gapBefore.bottom}, 距左 ${gapBefore.left - paneLeft}`)

  // 遮罩只盖任务区，侧栏仍可点
  await q(`(() => { const row = document.querySelector('.task-row'); if (row) row.click() })()`)
  await waitFor(async () => q(`!!document.querySelector('.drawer-layer')`), { label: '抽屉打开' })
  const scrim = JSON.parse(
    await q(`(() => {
      const layer = document.querySelector('.drawer-layer').getBoundingClientRect()
      const side = document.querySelector('.sidebar').getBoundingClientRect()
      return JSON.stringify({ layerLeft: Math.round(layer.left), sidebarRight: Math.round(side.right), layerRight: Math.round(layer.right), win: window.innerWidth })
    })()`),
  )
  if (scrim.layerLeft < scrim.sidebarRight) throw new Error(`遮罩盖住了侧栏：${JSON.stringify(scrim)}`)
  if (scrim.layerRight < scrim.win - 2) throw new Error(`遮罩没盖到右缘：${JSON.stringify(scrim)}`)
  await clickNav('今天')
  const switched = await waitFor(async () => {
    const title = await q(`document.querySelector('.list-pane__title')?.textContent ?? null`)
    return title === '今天' ? title : null
  }, { label: '抽屉开启时侧栏可点' })
  step('遮罩只覆盖任务区', `左界 ${scrim.layerLeft} / 侧栏右缘 ${scrim.sidebarRight}，可点侧栏切到「${switched}」`)

  // 清理本轮新建的任务
  await deleteFixtures()
  step('清理视图用例数据')

  // 删除当前列表：先切回该列表（非列表视图下删除项是禁用的），再走 ⋯ 菜单 → 确认对话框
  await clickList('工作')
  await waitFor(async () => q(`document.querySelector('.list-pane__title')?.textContent === '工作'`), { label: '回到工作列表' })
  await openListMenu()
  await q(`[...document.querySelectorAll('.list-menu__item')].find(b => b.textContent.includes('删除列表')).click()`)
  await waitFor(async () => q(`!!document.querySelector('.modal')`), { label: '删除确认对话框' })
  await q(`[...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === '删除').click()`)

  await waitFor(async () => !(await getState()).lists.some((list) => list.name === '工作'), {
    label: '列表被删除',
    timeout: 40000,
  })
  step('删除列表 → 邮箱文件夹一并移除')

  const dividerGone = await waitFor(async () => !(await q(`!!document.querySelector('.sidebar__divider')`)), { label: '无列表时分隔线消失' })
  const hintGone = !(await q(`!!document.querySelector('.sidebar__hint')`))
  if (!hintGone) throw new Error('无列表时仍显示提示文字')
  step('无列表时不显示分隔线与提示', `divider=${!dividerGone} hint=${!hintGone}`)

  // 布局：左右两栏可拖拽调宽，双击恢复默认
  const widthOf = (selector) =>
    q(`(() => { const el = document.querySelector('${selector}'); return el ? Math.round(el.getBoundingClientRect().width) : null })()`)

  // 先复位到默认宽度，避免上一轮遗留的自定义宽度干扰断言
  await q(`document.querySelectorAll('.resizer')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await waitFor(async () => (await widthOf('.sidebar')) !== null, { label: '布局就绪' })
  const before = await widthOf('.sidebar')
  await q(`(() => {
    const r = document.querySelectorAll('.resizer')[0]
    const b = r.getBoundingClientRect()
    const x = b.left + 2, y = b.top + 100
    r.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 80, clientY: y, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })()`)
  const after = await waitFor(async () => {
    const value = await widthOf('.sidebar')
    return value > before ? value : null
  }, { label: '侧栏被拖宽' })
  step('拖动调整侧栏宽度', `${before} → ${after}`)

  await q(`document.querySelectorAll('.resizer')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  const restored = await waitFor(async () => {
    const value = await widthOf('.sidebar')
    return value === before ? value : null
  }, { label: '双击恢复默认宽度' })
  step('双击恢复默认宽度', String(restored))

  console.log('\n=== 全部通过 ===')
} catch (error) {
  console.error('\n=== 失败 ===')
  console.error(error.message)
  try {
    const snapshot = await q(`JSON.stringify({
      title: document.querySelector('.list-pane__title')?.textContent ?? null,
      lists: [...document.querySelectorAll('.sidebar__lists .nav-item')].map(b => b.textContent.trim()),
      toast: document.querySelector('.toast')?.textContent ?? null,
      modal: !!document.querySelector('.modal'),
      menuOpen: !!document.querySelector('.list-menu__panel'),
      search: document.querySelector('.sidebar__search input')?.value ?? null,
    })`)
    console.error('现场:', snapshot)
  } catch {
    console.error('现场: 无法读取')
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
  if (shot) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(new URL('./_fail.png', import.meta.url), Buffer.from(shot.data, 'base64'))
  }
  process.exitCode = 1
} finally {
  console.log('\n已执行步骤：')
  console.log(steps.join('\n'))
  page.close()
}

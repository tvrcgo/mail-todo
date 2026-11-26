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

const getState = async () => JSON.parse(await page.evaluate('window.mailtodo.getState().then((s) => JSON.stringify(s))'))
const q = (expr) => page.evaluate(expr)
const today = new Date().toLocaleDateString('sv-SE')
const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE')

const clickNav = (label) =>
  q(`(() => {
    const item = [...document.querySelectorAll('.sidebar__nav .nav-item')].find(b => b.textContent.includes('${label}'))
    if (!item) return false
    item.click()
    return true
  })()`)

const clickList = (name) =>
  q(`(() => {
    const item = [...document.querySelectorAll('.sidebar__lists .nav-item')].find(b => b.textContent.includes('${name}'))
    if (!item) return false
    item.click()
    return true
  })()`)

async function openListMenu() {
  if (await q(`!!document.querySelector('.list-menu__panel')`)) return
  await q(`document.querySelector('.list-menu__trigger').click()`)
  await waitFor(async () => q(`!!document.querySelector('.list-menu__panel')`), { label: '列表操作菜单' })
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

  // 清理上一轮遗留的 Todo-工作 列表
  const existing = (await getState()).lists.find((list) => list.name === '工作')
  if (existing) {
    await q(`window.mailtodo.deleteList({ path: ${JSON.stringify(existing.path)} })`)
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

  // 搜索
  await q(`${SET_VALUE}('.list-pane__search', '报销')`)
  await waitFor(
    async () => {
      const titles = await q(`JSON.stringify([...document.querySelectorAll('.task-row__title')].map(e => e.textContent))`)
      const list = JSON.parse(titles)
      return list.length === 1 && list[0] === '补交报销'
    },
    { label: '搜索过滤', timeout: 10000 },
  )
  step('本地搜索过滤', '只剩「补交报销」')

  await q(`${SET_VALUE}('.list-pane__search', '')`)

  // 截图
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(new URL('./_ui.png', import.meta.url), Buffer.from(shot.data, 'base64'))

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

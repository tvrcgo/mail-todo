import { readFileSync, writeFileSync } from 'node:fs'

import { connect, waitFor } from './cdp.mjs'

const TITLE = '自检任务-邮件即记录'
const EDITED = '自检任务-已编辑'

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

const getState = async () =>
  JSON.parse(await page.evaluate('window.mailtodo.getState().then((s) => JSON.stringify(s))'))

const findTask = async (title) => (await getState()).tasks.find((task) => task.title === title) ?? null

const clickNav = async (label) =>
  page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.sidebar__nav .nav-item')].find(b => b.textContent.includes('${label}'))
    if (!item) return false
    item.click()
    return true
  })()`)

const clickRowButton = async (title, selector) =>
  page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.task-row')].find(r => r.textContent.includes('${title}'))
    if (!row) return false
    const el = row.querySelector('${selector}')
    if (!el) return false
    el.click()
    return true
  })()`)

try {
  await waitFor(async () => page.evaluate(`!!document.querySelector('.app')`), { label: '主界面', timeout: 30000 })
  step('主界面已就绪')

  if (!(await clickNav('任务'))) throw new Error('找不到「任务」导航')
  await waitFor(async () => page.evaluate(`document.querySelector('.list-pane__title')?.textContent === '任务'`), {
    label: '切换到任务视图',
  })
  step('切换到任务视图')

  // 清理上一轮遗留的同名任务，保证用例可重复运行
  const stale = (await getState()).tasks.filter((task) => task.title.startsWith('自检任务'))
  for (const task of stale) {
    await page.evaluate(`window.mailtodo.deleteTask({ taskId: ${JSON.stringify(task.id)} })`)
  }
  if (stale.length) {
    await waitFor(async () => (await getState()).tasks.every((task) => !task.title.startsWith('自检任务')), {
      label: '清理遗留任务',
      timeout: 40000,
    })
    step('清理上一轮遗留任务', `${stale.length} 条`)
  }

  await page.evaluate(`${SET_VALUE}('.quick-add__input', ${JSON.stringify(TITLE)})`)
  await page.evaluate(`document.querySelector('.quick-add__input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)

  const created = await waitFor(() => findTask(TITLE), { label: '任务写入邮箱并回读', timeout: 40000 })
  step('新建任务', `uid=${created.uid} rev=${created.rev} done=${created.done} important=${created.important}`)

  const duplicates = (await getState()).tasks.filter((task) => task.title === TITLE)
  if (duplicates.length !== 1) throw new Error(`任务重复：${duplicates.length} 条`)
  step('新建后只有一封邮件对应')

  await waitFor(() => clickRowButton(TITLE, '.task-row__check'), { label: '点击完成' })
  await waitFor(async () => (await findTask(TITLE))?.done === true, { label: '完成状态同步', timeout: 30000 })
  step('勾选完成 → 邮件标为已读')

  const rowVisible = async () =>
    page.evaluate(`!![...document.querySelectorAll('.task-row')].find(r => r.textContent.includes('${TITLE}'))`)
  if (!(await rowVisible())) {
    await page.evaluate(`document.querySelector('.completed__toggle')?.click()`)
    await waitFor(rowVisible, { label: '展开已完成区' })
  }
  await clickRowButton(TITLE, '.task-row__check')
  await waitFor(async () => (await findTask(TITLE))?.done === false, { label: '取消完成同步', timeout: 30000 })
  step('取消完成 → 邮件恢复未读')

  await waitFor(() => clickRowButton(TITLE, '.task-row__star'), { label: '点击重要' })
  await waitFor(async () => (await findTask(TITLE))?.important === true, { label: '重要状态同步', timeout: 30000 })
  step('标为重要 → 邮件打上旗标')

  await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.task-row')].find(r => r.textContent.includes('${TITLE}'))
    row.click()
  })()`)
  await waitFor(async () => page.evaluate(`!!document.querySelector('.detail__title')`), { label: '详情面板' })

  await page.evaluate(`${SET_VALUE}('.detail__title', ${JSON.stringify(EDITED)})`)
  await page.evaluate(`document.querySelector('.detail__title').blur()`)

  const edited = await waitFor(() => findTask(EDITED), { label: '标题编辑生效', timeout: 40000 })
  if (edited.rev !== 2) throw new Error(`Rev 未递增，实际 ${edited.rev}`)
  step('编辑标题', `rev=${edited.rev} uid=${edited.uid}（新版本邮件替换旧版本）`)

  const afterEdit = (await getState()).tasks.filter((task) => task.id === edited.id)
  if (afterEdit.length !== 1) throw new Error(`编辑后出现多个版本：${afterEdit.length}`)
  step('编辑后仍只有一条任务')

  // 详情以抽屉形式盖在列表上，带半透明遮罩
  const drawer = JSON.parse(
    await page.evaluate(`JSON.stringify({
      drawer: !!document.querySelector('.drawer'),
      scrim: getComputedStyle(document.querySelector('.drawer-scrim')).backgroundColor,
      coversList: document.elementFromPoint(600, 400)?.className ?? '',
    })`),
  )
  if (!drawer.drawer) throw new Error('详情不是抽屉形式')
  if (!drawer.scrim.startsWith('rgba(0, 0, 0')) throw new Error(`遮罩颜色异常：${drawer.scrim}`)
  if (drawer.coversList !== 'drawer-scrim') throw new Error(`列表没有被遮罩覆盖：${drawer.coversList}`)
  step('详情以抽屉覆盖列表', drawer.scrim)

  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL('./_ui.png', import.meta.url), Buffer.from(shot.data, 'base64'))

  await page.evaluate(`[...document.querySelectorAll('.detail button')].find(b => b.textContent.includes('删除任务')).click()`)
  await waitFor(async () => page.evaluate(`!![...document.querySelectorAll('.detail button')].find(b => b.textContent.includes('确认删除'))`), {
    label: '二次确认出现',
  })
  await page.evaluate(`[...document.querySelectorAll('.detail button')].find(b => b.textContent.includes('确认删除')).click()`)

  await waitFor(async () => !(await getState()).tasks.some((task) => task.title === EDITED), {
    label: '任务被删除',
    timeout: 40000,
  })
  step('删除任务 → 移出列表')

  // 抽屉的关闭方式：点遮罩、按 Esc
  await page.evaluate(`(() => { const row = document.querySelector('.task-row'); if (row) row.click() })()`)
  await waitFor(async () => page.evaluate(`!!document.querySelector('.drawer')`), { label: '再次打开抽屉' })
  await page.evaluate(`document.querySelector('.drawer-scrim').click()`)
  await waitFor(async () => !(await page.evaluate(`!!document.querySelector('.drawer')`)), { label: '点遮罩关闭' })
  step('点击遮罩关闭抽屉')

  await page.evaluate(`(() => { const row = document.querySelector('.task-row'); if (row) row.click() })()`)
  await waitFor(async () => page.evaluate(`!!document.querySelector('.drawer')`), { label: '再次打开抽屉' })
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await waitFor(async () => !(await page.evaluate(`!!document.querySelector('.drawer')`)), { label: 'Esc 关闭' })
  step('按 Esc 关闭抽屉')

  console.log('\n=== 全部通过 ===')
  console.log(JSON.stringify({ title: EDITED, uid: edited.uid, rev: edited.rev }))
} catch (error) {
  console.error('\n=== 失败 ===')
  console.error(error.message)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
  if (shot) writeFileSync(new URL('./_fail.png', import.meta.url), Buffer.from(shot.data, 'base64'))
  process.exitCode = 1
} finally {
  console.log('\n已执行步骤：')
  console.log(steps.join('\n'))
  page.close()
}

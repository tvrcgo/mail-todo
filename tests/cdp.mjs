// 极简 CDP 客户端：通过 --remote-debugging-port 附加到已运行的 Electron 实例
const PORT = process.env.CDP_PORT ?? '9222'

export async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('没有找到页面目标')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? '脚本执行异常')
    }
    return result.result.value
  }

  return { send, evaluate, close: () => ws.close(), target: page }
}

export async function waitFor(predicate, { timeout = 15000, interval = 250, label = '条件' } = {}) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await predicate()
    if (last) return last
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`等待超时：${label}（最后值 ${JSON.stringify(last)}）`)
}

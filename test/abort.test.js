const test = require('brittle')
const { search, walk, AbortError } = require('..')
const { AbortController, corpus } = require('./helpers')

test('an aborted signal rejects before any work', async (t) => {
  const root = corpus(t, { plain: true })
  const controller = new AbortController()
  controller.abort()

  const error = await search({ root, queries: ['hello'], signal: controller.signal }).catch(
    (e) => e
  )

  t.ok(error instanceof AbortError)
  t.is(error.name, 'AbortError')
  t.is(error.code, 'ABORT_ERR')
})

test('aborting a search in flight rejects with AbortError', async (t) => {
  const root = corpus(t)
  const controller = new AbortController()

  const pending = search({ root, queries: ['hello'], signal: controller.signal })
  controller.abort()

  const error = await pending.catch((e) => e)
  t.is(error.name, 'AbortError')
})

test('aborting a walk in flight rejects with AbortError', async (t) => {
  const root = corpus(t)
  const controller = new AbortController()

  const pending = walk({ root, signal: controller.signal })
  controller.abort()

  const error = await pending.catch((e) => e)
  t.is(error.name, 'AbortError')
})

test('a signal that never aborts changes nothing', async (t) => {
  const root = corpus(t, { plain: true })
  const controller = new AbortController()

  const { hits } = await search({ root, queries: ['TODO'], signal: controller.signal })
  t.is(hits.length, 1)

  controller.abort()
  t.is((await search({ root, queries: ['TODO'] })).hits.length, 1)
})

test('searches run off the JS thread', async (t) => {
  const root = corpus(t)
  let ticks = 0
  const timer = setInterval(() => ticks++, 1)

  for (let i = 0; i < 20; i++) await search({ root, queries: ['hello'], includeIgnored: true })

  clearInterval(timer)
  t.ok(ticks > 0)
})

test('concurrent searches each get their own result', async (t) => {
  const root = corpus(t, { plain: true })
  const [todo, fox, none] = await Promise.all([
    search({ root, queries: ['TODO'] }),
    search({ root, queries: ['quick brown fox'] }),
    search({ root, queries: ['zzz'] })
  ])

  t.alike(
    todo.hits.map((hit) => hit.path),
    ['src/main.js']
  )
  t.alike(
    fox.hits.map((hit) => hit.path),
    ['a.txt']
  )
  t.is(none.hits.length, 0)
})

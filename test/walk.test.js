const test = require('brittle')
const { walk } = require('..')
const { corpus, paths, write } = require('./helpers')

test('lists files relative to root, sorted, with mtime', async (t) => {
  const root = corpus(t, { plain: true })
  const { files, truncated } = await walk({ root })

  t.is(truncated, false)
  t.alike(paths({ files }), [
    'a.txt',
    'crlf.txt',
    'data/binary.bin',
    'docs/guide/intro.md',
    'docs/readme.md',
    'no-newline.txt',
    'nothing.txt',
    'special.txt',
    'src/main.js',
    'src/util.ts',
    'unicode.txt'
  ])
  t.ok(files.every((file) => Number.isInteger(file.mtime) && file.mtime > 1_600_000_000_000))
})

test('mtime is in milliseconds', async (t) => {
  const root = corpus(t, { plain: true })
  const before = Date.now() - 60_000
  write(root, 'fresh.txt', 'x')
  const { files } = await walk({ root, include: 'fresh.txt' })

  t.is(files.length, 1)
  t.ok(files[0].mtime >= before && files[0].mtime <= Date.now() + 60_000)
})

test('ignore files, skipped folders and symlinks', async (t) => {
  const root = corpus(t)
  const found = paths(await walk({ root }))

  for (const hidden of [
    'ignored.txt',
    'secret.txt',
    'other.log',
    'build/out.js',
    'sub/local.txt'
  ]) {
    t.absent(found.includes(hidden), hidden)
  }
  for (const kept of ['app.log', '.dotfile', '.gitignore', 'sub/keep.txt', 'many/f00.txt']) {
    t.ok(found.includes(kept), kept)
  }
  t.absent(found.some((file) => /^(\.git|node_modules|\.trash|\.hg|\.cache|\.next)\//.test(file)))
  t.absent(
    found.some((file) => file.startsWith('link-')),
    'symlinks'
  )
})

test('includeIgnored walks ignored files and hidden tool folders, not .git', async (t) => {
  const root = corpus(t)
  const found = paths(await walk({ root, includeIgnored: true }))

  t.ok(found.includes('ignored.txt'))
  t.ok(found.includes('build/out.js'))
  t.ok(found.includes('.hg/file.txt'))
  t.absent(found.some((file) => /^(\.git|node_modules|\.trash)\//.test(file)))
  t.absent(
    found.some((file) => file.startsWith('link-')),
    'symlinks'
  )
})

test('include, deny and folder', async (t) => {
  const root = corpus(t, { plain: true })

  t.alike(paths(await walk({ root, include: '*.md' })), ['docs/guide/intro.md', 'docs/readme.md'])
  t.alike(paths(await walk({ root, include: '*.md', deny: [`${root}/docs/guide`] })), [
    'docs/readme.md'
  ])
  t.alike(paths(await walk({ root, folder: 'src' })), ['src/main.js', 'src/util.ts'])
})

test('maxEntries counts files and folders and sets truncated', async (t) => {
  const root = corpus(t)
  const full = await walk({ root, folder: 'many', maxEntries: 50 })
  const cut = await walk({ root, folder: 'many', maxEntries: 20 })

  t.is(full.files.length, 50)
  t.is(full.truncated, false)
  t.is(cut.truncated, true)
  t.ok(cut.files.length <= 20)
})

test('same files from one run to the next', async (t) => {
  const root = corpus(t)
  const first = await walk({ root })

  for (let i = 0; i < 5; i++) t.alike(await walk({ root }), first)
})

test('a missing root rejects', async (t) => {
  await t.exception(walk({ root: '/nonexistent-bare-ripgrep' }), /not a directory/)
})

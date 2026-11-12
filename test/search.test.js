const test = require('brittle')
const { search } = require('..')
const { corpus, paths, write } = require('./helpers')

const grep = (root, queries, options) => search({ root, queries, ...options })

test('literal match is case-insensitive and sorted by path then line', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits, truncated, cut } = await grep(root, ['hello'])

  t.alike(
    hits.map((hit) => `${hit.path}:${hit.line}`),
    [
      'a.txt:1',
      'crlf.txt:1',
      'docs/guide/intro.md:1',
      'docs/readme.md:2',
      'no-newline.txt:2',
      'src/main.js:1',
      'src/main.js:2',
      'src/util.ts:1'
    ]
  )
  t.is(truncated, false)
  t.is(cut, false)
})

test('hit text is the line without its newline, and keeps a carriage return', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['world'], { include: 'crlf.txt' })

  t.alike(hits, [{ path: 'crlf.txt', line: 2, text: 'world\r' }])
})

test('a last line without a newline still matches', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['last hello'])

  t.alike(hits, [{ path: 'no-newline.txt', line: 2, text: 'last hello' }])
})

test('case sensitive', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['Hello'], { caseSensitive: true, include: '*.js' })

  t.alike(hits, [{ path: 'src/main.js', line: 2, text: 'function Hello() {}' }])
})

test('unicode text is matched and returned', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['café'], { include: 'unicode.txt' })

  t.alike(hits, [{ path: 'unicode.txt', line: 2, text: 'CAFÉ' }])
})

test('a literal query treats regex characters as text', async (t) => {
  const root = corpus(t, { plain: true })
  const dot = await grep(root, ['a.b'])
  const parens = await grep(root, ['(parens)', '[brackets]', '$dollar'])

  t.alike(
    dot.hits.map((hit) => hit.path),
    ['special.txt']
  )
  t.alike(
    parens.hits.map((hit) => hit.path),
    ['special.txt']
  )
  t.is(parens.hits.length, 1)
})

test('regex', async (t) => {
  const root = corpus(t, { plain: true })
  const literal = await grep(root, ['foo.bar'], { include: 'intro.md' })
  const regex = await grep(root, ['foo.bar'], { include: 'intro.md', regex: true })

  t.alike(
    literal.hits.map((hit) => hit.line),
    [2]
  )
  t.alike(
    regex.hits.map((hit) => hit.line),
    [2, 3]
  )
})

test('regex anchors match per line', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['^const \\w+ = \\d$'], { regex: true })

  t.alike(hits, [{ path: 'src/main.js', line: 1, text: 'const hello = 1' }])
})

test('an invalid regex rejects', async (t) => {
  const root = corpus(t, { plain: true })

  await t.exception(grep(root, ['(unclosed'], { regex: true }), /invalid regex/)
})

test('queries are alternatives', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['TODO', 'quick brown'])

  t.alike(
    hits.map((hit) => `${hit.path}:${hit.line}`),
    ['a.txt:3', 'src/main.js:3']
  )
})

test('regex queries are alternatives too', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['^let\\b', 'fox$'], { regex: true })

  t.alike(
    hits.map((hit) => `${hit.path}:${hit.line}`),
    ['a.txt:3', 'src/main.js:4']
  )
})

test('no match is an empty, untruncated result', async (t) => {
  const root = corpus(t, { plain: true })

  t.alike(await grep(root, ['zzz-not-there']), { hits: [], truncated: false, cut: false })
})

test('a file with a NUL in its first 1024 bytes is skipped', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits } = await grep(root, ['binary'])

  t.alike(hits, [])
})

test('a NUL past the first 1024 bytes is text', async (t) => {
  const root = corpus(t)
  const { hits } = await grep(root, ['hello'], { include: 'late-nul.txt' })

  t.alike(
    hits.map((hit) => hit.line),
    [2]
  )
})

test('.gitignore and .ignore are honoured, .ignore wins', async (t) => {
  const root = corpus(t)
  const found = paths(await grep(root, ['hello'], { include: ['*.txt', '*.log', '*.js'] }))

  t.absent(found.includes('ignored.txt'), '.gitignore file')
  t.absent(found.includes('build/out.js'), '.gitignore directory')
  t.absent(found.includes('other.log'), '.gitignore glob')
  t.absent(found.includes('secret.txt'), '.ignore file')
  t.absent(found.includes('sub/local.txt'), 'nested .gitignore')
  t.ok(found.includes('app.log'), '.ignore negation beats .gitignore')
  t.ok(found.includes('sub/keep.txt'))
})

test('ignore files apply without a git repository above', async (t) => {
  const root = corpus(t, { plain: true })
  write(root, '.gitignore', 'a.txt\n')

  t.absent(paths(await grep(root, ['hello'])).includes('a.txt'))
  t.absent(paths(await grep(root, ['world'])).includes('a.txt'))
})

test('.git, node_modules and .trash are skipped, even with includeIgnored', async (t) => {
  const root = corpus(t)
  const found = paths(await grep(root, ['hello tool'], { includeIgnored: true }))

  t.absent(found.some((file) => /^(\.git|node_modules|\.trash)\//.test(file)))
})

test('hidden tool folders are skipped unless includeIgnored', async (t) => {
  const root = corpus(t)
  const hidden = ['.hg', '.svn', '.venv', '.cache', '.next'].map((dir) => `${dir}/file.txt`)

  t.alike(paths(await grep(root, ['hello tool'])), [])
  t.alike(paths(await grep(root, ['hello tool'], { includeIgnored: true })), hidden.sort())
})

test('dotfiles are searched', async (t) => {
  const root = corpus(t)

  t.ok(paths(await grep(root, ['hello dot'])).includes('.dotfile'))
})

test('includeIgnored searches what ignore files skip', async (t) => {
  const root = corpus(t)
  const found = paths(await grep(root, ['hello'], { includeIgnored: true, include: '*.txt' }))

  t.ok(found.includes('ignored.txt'))
  t.ok(found.includes('secret.txt'))
  t.ok(found.includes('sub/local.txt'))
})

test('include: a bare name matches the basename at any depth', async (t) => {
  const root = corpus(t, { plain: true })

  t.alike(paths(await grep(root, ['hello'], { include: 'readme.md' })), ['docs/readme.md'])
  t.alike(paths(await grep(root, ['hello'], { include: '*.md' })), [
    'docs/guide/intro.md',
    'docs/readme.md'
  ])
})

test('include: a pattern with a slash matches the path', async (t) => {
  const root = corpus(t, { plain: true })

  t.alike(paths(await grep(root, ['hello'], { include: 'docs/*.md' })), ['docs/readme.md'])
  t.alike(paths(await grep(root, ['hello'], { include: 'docs/**/*.md' })), [
    'docs/guide/intro.md',
    'docs/readme.md'
  ])
  t.alike(paths(await grep(root, ['hello'], { include: './src/**' })), [
    'src/main.js',
    'src/util.ts'
  ])
  t.alike(paths(await grep(root, ['hello'], { include: 'readme.md' })), ['docs/readme.md'])
})

test('include: several globs are alternatives, other characters are literal', async (t) => {
  const root = corpus(t, { plain: true })
  write(root, 'x[1].txt', 'hello\n')
  write(root, 'x1.txt', 'hello\n')

  t.alike(paths(await grep(root, ['hello'], { include: ['*.ts', '*.js'] })), [
    'src/main.js',
    'src/util.ts'
  ])
  t.alike(paths(await grep(root, ['hello'], { include: 'x[1].txt' })), ['x[1].txt'])
})

test('deny skips files and folders under a denied path', async (t) => {
  const root = corpus(t, { plain: true })
  const found = paths(
    await grep(root, ['hello'], { deny: [`${root}/docs`, `${root}/SRC/main.js`] })
  )

  t.alike(found, ['a.txt', 'crlf.txt', 'no-newline.txt', 'src/util.ts'])
})

test('deny matches whole path segments', async (t) => {
  const root = corpus(t, { plain: true })
  const found = paths(await grep(root, ['hello'], { deny: [`${root}/do`] }))

  t.ok(found.includes('docs/readme.md'))
})

test('folder narrows the search and paths stay relative to root', async (t) => {
  const root = corpus(t, { plain: true })

  t.alike(paths(await grep(root, ['hello'], { folder: 'docs' })), [
    'docs/guide/intro.md',
    'docs/readme.md'
  ])
  t.alike(paths(await grep(root, ['hello'], { folder: '/docs/guide/' })), ['docs/guide/intro.md'])
})

test('ignore files between root and folder still apply', async (t) => {
  const root = corpus(t, { plain: true })
  write(root, 'docs/.gitignore', 'readme.md\n')
  write(root, '.ignore', 'guide/\n')

  t.alike(paths(await grep(root, ['hello'], { folder: 'docs' })), [])
})

test('a folder outside root or missing rejects', async (t) => {
  const root = corpus(t, { plain: true })

  await t.exception(grep(root, ['hello'], { folder: '../x' }), /escapes root/)
  await t.exception(grep(root, ['hello'], { folder: 'nope' }), /not a directory/)
  await t.exception(grep(`${root}/nope`, ['hello']), /not a directory/)
})

test('symlinks are not followed', async (t) => {
  const root = corpus(t)
  const found = paths(await grep(root, ['hello world'], { include: '*.txt' }))

  t.alike(found, ['a.txt'])
  t.alike(paths(await grep(root, ['intro hello'])), ['docs/guide/intro.md'])
})

test('hit text is cut to 500 characters', async (t) => {
  const root = corpus(t)
  const { hits, cut } = await grep(root, ['needle'], { include: 'long.txt' })

  t.is(hits.length, 2)
  t.is(hits[0].text, 'x'.repeat(500))
  t.is(hits[1].text, 'short needle')
  t.is(cut, false)
})

test('hit text counts UTF-16 units and drops a pair the cut splits', async (t) => {
  const root = corpus(t)
  const { hits } = await grep(root, ['hello'], { include: 'emoji.txt' })

  t.is(hits[0].text, 'a'.repeat(499))
})

test('a line past 1 MiB is searched in its head only and reports cut', async (t) => {
  const root = corpus(t)
  const { hits, cut } = await grep(root, ['tailneedle'], { include: 'huge.txt' })

  t.alike(hits, [{ path: 'huge.txt', line: 2, text: 'short tailneedle' }])
  t.is(cut, true)
})

test('maxMatches keeps the first hits by path then line and sets truncated', async (t) => {
  const root = corpus(t)
  const { hits, truncated } = await grep(root, ['hello'], { include: 'many/*.txt', maxMatches: 5 })

  t.is(truncated, true)
  t.alike(
    hits.map((hit) => `${hit.path}:${hit.line}`),
    ['many/f00.txt:1', 'many/f00.txt:2', 'many/f01.txt:1', 'many/f01.txt:2', 'many/f02.txt:1']
  )
})

test('maxMatches is deterministic across runs', async (t) => {
  const root = corpus(t)
  const first = await grep(root, ['hello'], { maxMatches: 7 })

  for (let i = 0; i < 5; i++) t.alike(await grep(root, ['hello'], { maxMatches: 7 }), first)
})

test('exactly maxMatches hits is not truncated', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits, truncated } = await grep(root, ['hello'], { include: 'src/*', maxMatches: 3 })

  t.is(hits.length, 3)
  t.is(truncated, false)
})

test('maxMatches of zero returns nothing and truncated when there is a hit', async (t) => {
  const root = corpus(t, { plain: true })
  const { hits, truncated } = await grep(root, ['hello'], { maxMatches: 0 })

  t.alike(hits, [])
  t.is(truncated, true)
})

test('maxEntries caps the walk and sets truncated', async (t) => {
  const root = corpus(t)
  const { hits, truncated } = await grep(root, ['hello'], { folder: 'many', maxEntries: 10 })

  t.is(truncated, true)
  t.ok(hits.length <= 20)
})

test('maxEntries above the tree is not truncated', async (t) => {
  const root = corpus(t)
  const { truncated } = await grep(root, ['hello'], { folder: 'many', maxEntries: 50 })

  t.is(truncated, false)
})

test('identical results from one run to the next', async (t) => {
  const root = corpus(t)
  const first = await grep(root, ['hello'], { includeIgnored: true })

  for (let i = 0; i < 5; i++) {
    t.alike(await grep(root, ['hello'], { includeIgnored: true }), first)
  }
})

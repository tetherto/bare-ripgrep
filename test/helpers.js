const bare = typeof Bare !== 'undefined'
const fs = bare ? require('bare-fs') : require('fs')
const os = bare ? require('bare-os') : require('os')
const path = bare ? require('bare-path') : require('path')

const CORPUS = path.join(__dirname, 'fixtures', 'corpus')

exports.AbortController = globalThis.AbortController || require('bare-abort-controller')

exports.write = function write(root, file, data) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

function copy(from, to) {
  for (const rel of fs.readdirSync(from, { recursive: true })) {
    if (!fs.statSync(path.join(from, rel)).isDirectory()) {
      exports.write(to, rel, fs.readFileSync(path.join(from, rel)))
    }
  }
}

// What git cannot hold in a fixture tree, or would itself ignore, is written per run.
function generate(root) {
  const { write } = exports

  write(root, '.gitignore', 'ignored.txt\nbuild/\n*.log\n')
  write(root, '.ignore', '!app.log\nsecret.txt\n')
  write(root, 'ignored.txt', 'hello ignored\n')
  write(root, 'secret.txt', 'hello secret\n')
  write(root, 'app.log', 'hello log\n')
  write(root, 'other.log', 'hello other log\n')
  write(root, 'build/out.js', 'hello build\n')
  write(root, 'sub/.gitignore', 'local.txt\n')
  write(root, 'sub/local.txt', 'hello local\n')
  write(root, 'sub/keep.txt', 'hello keep\n')
  write(root, '.dotfile', 'hello dot\n')

  for (const dir of [
    '.git',
    'node_modules/pkg',
    '.trash',
    '.hg',
    '.svn',
    '.venv',
    '.cache',
    '.next'
  ]) {
    write(root, `${dir}/file.txt`, 'hello tool\n')
  }

  write(root, 'long.txt', `${'x'.repeat(2000)} needle\nshort needle\n`)
  write(root, 'huge.txt', `${'a'.repeat(1024 * 1024 + 10)} tailneedle\nshort tailneedle\n`)
  write(root, 'late-nul.txt', `${'text '.repeat(400)}\nhello\0tail\n`)
  write(root, 'emoji.txt', `${'a'.repeat(499)}\u{1F600}b hello\n`)

  for (let i = 0; i < 50; i++) {
    write(root, `many/f${String(i).padStart(2, '0')}.txt`, 'hello\nhello\n')
  }

  fs.symlinkSync('a.txt', path.join(root, 'link-file.txt'))
  fs.symlinkSync('docs', path.join(root, 'link-dir'))
}

// A fresh copy of the corpus. `plain` leaves out the generated files.
exports.corpus = function corpus(t, { plain = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-ripgrep-'))
  t.teardown(() => fs.rmSync(root, { recursive: true, force: true }))

  copy(CORPUS, root)
  if (!plain) generate(root)

  return root
}

exports.paths = function paths(result) {
  return [...new Set((result.hits || result.files).map((entry) => entry.path))]
}

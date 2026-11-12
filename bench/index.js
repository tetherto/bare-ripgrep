// node bench/index.js <dir> [pattern...]   compares search() with `rg -i -F -n` under the same ignore rules
const { spawnSync } = require('child_process')
const { search } = require('..')

const [dir, ...patterns] = process.argv.slice(2)
if (!dir) {
  console.error('usage: node bench/index.js <dir> [pattern...]')
  process.exit(1)
}

const RUNS = 5
const MAX = 1_000_000

async function timeAsync(fn) {
  let best = Infinity
  let last
  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint()
    last = await fn()
    best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6)
  }
  return { ms: best, value: last }
}

function rg(pattern) {
  const run = spawnSync(
    'rg',
    [
      ...['-i', '-F', '-n', '--no-heading', '--no-messages'],
      // the ignore rules search() applies: no .git/info/exclude, no parent or global files
      ...['--hidden', '--no-require-git', '--no-ignore-global', '--no-ignore-parent'],
      ...['--no-ignore-exclude', '-g', '!.git', '-g', '!node_modules', '-g', '!.trash'],
      ...['--', pattern, dir]
    ],
    {
      maxBuffer: 1 << 30
    }
  )
  return run.stdout.toString().split('\n').filter(Boolean).length
}

async function main() {
  console.log(`${dir}, best of ${RUNS}`)
  for (const pattern of patterns.length ? patterns : ['const']) {
    const ours = await timeAsync(() =>
      search({ root: dir, queries: [pattern], maxMatches: MAX, maxEntries: MAX })
    )
    const theirs = await timeAsync(() => rg(pattern))

    console.log(
      `${JSON.stringify(pattern)}: search ${ours.ms.toFixed(0)} ms (${ours.value.hits.length} hits, truncated ${ours.value.truncated})` +
        ` | rg ${theirs.ms.toFixed(0)} ms (${theirs.value} lines)`
    )
  }
}

main()

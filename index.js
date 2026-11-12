const binding = require('./binding')

const MAX_MATCHES = 1000
const MAX_ENTRIES = 10_000

class AbortError extends Error {
  constructor() {
    super('The operation was aborted')
    this.name = 'AbortError'
    this.code = 'ABORT_ERR'
  }
}

exports.AbortError = AbortError

exports.search = function search({
  root,
  folder = '',
  queries,
  regex = false,
  caseSensitive = false,
  include,
  deny,
  includeIgnored = false,
  maxMatches = MAX_MATCHES,
  maxEntries = MAX_ENTRIES,
  signal
}) {
  return run(
    {
      op: 'search',
      root,
      folder,
      queries,
      regex,
      caseSensitive,
      include: list(include),
      deny: list(deny),
      includeIgnored,
      maxMatches: count(maxMatches),
      maxEntries: count(maxEntries)
    },
    signal
  )
}

exports.walk = function walk({
  root,
  folder = '',
  include,
  deny,
  includeIgnored = false,
  maxEntries = MAX_ENTRIES,
  signal
}) {
  return run(
    {
      op: 'walk',
      root,
      folder,
      include: list(include),
      deny: list(deny),
      includeIgnored,
      maxMatches: 0,
      maxEntries: count(maxEntries)
    },
    signal
  )
}

function run(request, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new AbortError())

    let job = null

    const onabort = () => {
      binding.cancel(job)
      reject(new AbortError())
    }

    job = binding.start(JSON.stringify(request), (json) => {
      if (signal) signal.removeEventListener('abort', onabort)

      const result = JSON.parse(json)
      if (result.error) reject(new Error(result.error))
      else resolve(result)
    })

    if (signal) signal.addEventListener('abort', onabort, { once: true })
  })
}

function list(value) {
  return value === undefined ? [] : [].concat(value)
}

function count(value) {
  return Math.min(value, Number.MAX_SAFE_INTEGER)
}

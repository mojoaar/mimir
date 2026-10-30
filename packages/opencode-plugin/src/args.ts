export type IngestArgs = {
  command: 'ingest'
  path: string
  project?: string
  url?: string
  token?: string
  all: boolean
  dryRun: boolean
  help: boolean
}

export type SearchArgs = {
  command: 'search'
  query: string
  project?: string
  limit?: number
  url?: string
  token?: string
  help: boolean
}

export type ExportArgs = {
  command: 'export'
  project?: string
  out?: string
  url?: string
  token?: string
  help: boolean
}

export type Args = IngestArgs | SearchArgs | ExportArgs

const VALUE_FLAGS = new Set(['project', 'url', 'token', 'limit', 'out'])

/** Hand-rolled on purpose: five value flags do not justify a dependency. */
export function parseArgs(argv: string[]): Args {
  const first = argv[0]
  const command: Args['command'] =
    first === 'search' ? 'search' : first === 'export' ? 'export' : 'ingest'
  const rest = command === 'ingest' ? argv : argv.slice(1)

  let path = '.'
  let query = ''
  let all = false
  let dryRun = false
  let help = argv.length === 0
  let project: string | undefined
  let url: string | undefined
  let token: string | undefined
  let out: string | undefined
  let limit: number | undefined

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string
    if (arg === 'ingest' || arg === 'import' || arg === 'search' || arg === 'export') continue
    if (arg === '-h' || arg === '--help') {
      help = true
      continue
    }
    if (arg === '--all') {
      all = true
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2)
      const equals = body.indexOf('=')
      const name = equals === -1 ? body : body.slice(0, equals)
      if (!VALUE_FLAGS.has(name)) throw new Error(`unknown flag --${name}`)
      const value = equals === -1 ? rest[++i] : body.slice(equals + 1)
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
      if (name === 'project') project = value
      if (name === 'url') url = value
      if (name === 'token') token = value
      if (name === 'out') out = value
      if (name === 'limit') {
        const size = Number(value)
        if (!Number.isInteger(size) || size < 1) throw new Error('--limit needs a whole number')
        limit = size
      }
      continue
    }
    if (command === 'search') query = arg
    else if (command === 'ingest') path = arg
  }

  if (command === 'search') return { command, query, project, limit, url, token, help }
  if (command === 'export') return { command, project, out, url, token, help }
  return { command, path, project, url, token, all, dryRun, help }
}

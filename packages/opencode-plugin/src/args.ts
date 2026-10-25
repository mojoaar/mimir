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

const VALUE_FLAGS = new Set(['project', 'url', 'token'])

/** Hand-rolled on purpose: three value flags do not justify a dependency. */
export function parseArgs(argv: string[]): IngestArgs {
  const args: IngestArgs = {
    command: 'ingest',
    path: '.',
    all: false,
    dryRun: false,
    help: argv.length === 0,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string
    if (token === 'ingest' || token === 'import') continue
    if (token === '-h' || token === '--help') {
      args.help = true
      continue
    }
    if (token === '--all') {
      args.all = true
      continue
    }
    if (token === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (token.startsWith('--')) {
      const body = token.slice(2)
      const equals = body.indexOf('=')
      const name = equals === -1 ? body : body.slice(0, equals)
      if (!VALUE_FLAGS.has(name)) throw new Error(`unknown flag --${name}`)
      const value = equals === -1 ? argv[++i] : body.slice(equals + 1)
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
      if (name === 'project') args.project = value
      if (name === 'url') args.url = value
      if (name === 'token') args.token = value
      continue
    }
    args.path = token
  }

  return args
}

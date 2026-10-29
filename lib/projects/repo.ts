import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * The client computes the repo key, because a remote MCP server never sees the
 * client's working directory. Both branches below are therefore conventions the
 * plugin and the server share, not something the server can verify.
 */

const SCP_STYLE = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/

/**
 * The absolute directory a path-like input names, or null when the input is a
 * repository key. Both slash styles are accepted because a Windows client sends
 * its own, and the folder lookup compares with `/`. `~` still expands, because
 * a client that sends one expects a stable identity; the claim form refuses it
 * instead, where a person is the one typing.
 */
export function localPath(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null

  // Refused before normalising: `\\server\share` would otherwise look like a
  // posix path and collide with one.
  if (input.startsWith('\\\\')) return null

  const slashed = input.replace(/\\/g, '/')
  const drive = /^([a-zA-Z]):\/(.*)$/.exec(slashed)
  if (drive) {
    // path.resolve would put the server's cwd in front of a drive path, so this
    // is normalised by hand: lower-case drive, forward slashes, no trailing one.
    const rest = path.posix
      .normalize(drive[2]!)
      .replace(/^\.$/, '')
      .replace(/\/+$/, '')
    return `${drive[1]!.toLowerCase()}:/${rest}`
  }

  if (input.startsWith('~')) return path.posix.normalize(slashed.replace(/^~/, homedir()))

  if (slashed.startsWith('/')) return path.posix.normalize(slashed).replace(/\/+$/, '') || '/'
  return null
}

export function normaliseRepoKey(raw: string): string | null {
  const local = localPath(raw)
  if (local) return `local:${createHash('sha256').update(local).digest('hex')}`

  const input = raw.trim()
  if (!input) return null

  let host: string
  let repoPath: string

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      return null
    }
    host = url.hostname
    repoPath = url.pathname
  } else {
    const match = SCP_STYLE.exec(input)
    if (match?.[1] && match[2]) {
      host = match[1]
      repoPath = match[2]
    } else {
      // Already-normalised keys come back through here from clients that cache
      // them, so `host.tld/owner/repo` must be idempotent.
      const plain = input.split('/')
      if (plain.length < 3 || !plain[0]?.includes('.')) return null
      host = plain[0]
      repoPath = plain.slice(1).join('/')
    }
  }

  const segments = repoPath.split('/').filter(Boolean)
  const last = segments.at(-1)?.replace(/\.git$/i, '')
  if (!host || segments.length < 2 || !last) return null

  return [host, ...segments.slice(0, -1), last].join('/').toLowerCase()
}

/** `github.com/mojoaar/mimir` -> `mimir`; anything unusable -> `project`. */
export function repoSlug(repoKey: string): string {
  const last = repoKey.startsWith('local:') ? 'project' : (repoKey.split('/').at(-1) ?? '')
  const slug = last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

import { readdir, stat } from 'node:fs/promises'
import { posix, join } from 'node:path'

/**
 * What an import is for: the knowledge a reader would have to dig out of the
 * repository, not a second copy of the code the agent already has on disk.
 */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  'vendor',
  'target',
  'tmp',
])

export const IGNORED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tar', 'bz2', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'o', 'a', 'class', 'jar', 'wasm',
  'mp3', 'mp4', 'mov', 'avi', 'woff', 'woff2', 'ttf', 'eot',
])

const CONFIG_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'Dockerfile',
  'Makefile',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  '.env.example',
  'renovate.json',
  'turbo.json',
])

const PROSE = /\.(md|mdx)$/i
const ROOT_PROSE = /^(readme|changelog|contributing|license)/i
// A guard against a symlinked home directory, not a product limit: a real
// repository of 250 000 files is still walked, and hitting the cap is reported.
const MAX_ENTRIES = 250_000

export type WalkEntry = { path: string; bytes: number }
export type WalkResult = {
  files: WalkEntry[]
  skipped: { path: string; reason: string }[]
  /** True when the walk stopped early, so the caller must not report success. */
  truncated: boolean
}
export type WalkOptions = { all?: boolean; maxFileBytes?: number; maxEntries?: number }

function depth(path: string): number {
  return path.split('/').length - 1
}

function wanted(path: string): boolean {
  const base = posix.basename(path)
  if (ROOT_PROSE.test(base) && depth(path) <= 1) return true
  if (path.startsWith('docs/') || path.startsWith('doc/')) return PROSE.test(base)
  if (PROSE.test(base) && depth(path) <= 3) return true
  return CONFIG_FILES.has(base) && depth(path) <= 2
}

export async function selectFiles(root: string, options: WalkOptions = {}): Promise<WalkResult> {
  const maxFileBytes = options.maxFileBytes ?? 262_144
  const maxEntries = options.maxEntries ?? MAX_ENTRIES
  const files: WalkEntry[] = []
  const skipped: { path: string; reason: string }[] = []
  let seen = 0
  let truncated = false

  async function walk(relative: string): Promise<void> {
    const entries = await readdir(join(root, relative), { withFileTypes: true })
    for (const entry of entries) {
      if (++seen > maxEntries) {
        truncated = true
        return
      }
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        await walk(path)
        continue
      }
      if (!entry.isFile()) continue

      const extension = posix.extname(entry.name).slice(1).toLowerCase()
      if (IGNORED_EXTENSIONS.has(extension)) continue
      if (options.all !== true && !wanted(path)) continue

      const { size } = await stat(join(root, path))
      if (size > maxFileBytes) {
        skipped.push({ path, reason: `too large (${size} bytes)` })
        continue
      }
      files.push({ path, bytes: size })
    }
  }

  await walk('')
  return { files, skipped, truncated }
}

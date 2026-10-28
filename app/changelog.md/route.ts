import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The docs page renders every release as prose; this is the file itself, for a
// reader who wants to paste the whole thing somewhere.
export async function GET() {
  const body = await readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8')

  return new Response(body, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
}

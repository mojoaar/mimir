import { describe, expect, it } from 'vitest'

import { parseArgs } from '../src/args.js'

describe('parseArgs', () => {
  it('reads the path and the defaults', () => {
    expect(parseArgs(['ingest', '.'])).toEqual({
      command: 'ingest',
      path: '.',
      project: undefined,
      url: undefined,
      token: undefined,
      all: false,
      dryRun: false,
      help: false,
    })
  })

  it('accepts both spellings of a flag value', () => {
    expect(parseArgs(['ingest', '--project=notes']).project).toBe('notes')
    expect(parseArgs(['ingest', '--project', 'notes']).project).toBe('notes')
  })

  it('defaults the path when only flags are given', () => {
    const args = parseArgs(['ingest', '--project', 'notes', '--all', '--dry-run'])

    expect(args).toMatchObject({ path: '.', project: 'notes', all: true, dryRun: true })
  })

  it('asks for help rather than importing the working directory', () => {
    expect(parseArgs([]).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--help']).help).toBe(true)
  })

  it('refuses a flag it does not know', () => {
    expect(() => parseArgs(['ingest', '--nope'])).toThrow('unknown flag --nope')
  })

  it('refuses a flag with no value', () => {
    expect(() => parseArgs(['ingest', '--project'])).toThrow('--project needs a value')
  })
})

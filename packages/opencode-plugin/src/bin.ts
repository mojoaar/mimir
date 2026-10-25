#!/usr/bin/env node
// The published entrypoint. Kept separate from cli.ts so the command can be
// imported by tests without running: npm installs a bin as a symlink, so a
// `process.argv[1]` check here would never match `.bin/mimir` and the command
// would exit 0 doing nothing.
import { main } from './cli.js'

void main(process.argv.slice(2))

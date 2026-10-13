#!/usr/bin/env node
// Optional type check with TypeScript's checkJs, without adding dependencies to the repository.
// TypeScript and @types/node are installed into a temporary directory outside the repo
// (network required), then tsc runs against tsconfig.json with --typeRoots pointed there.
// Usage: node scripts/typecheck.mjs   (or: npm run typecheck)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(path.join(tmpdir(), 'pda-typecheck-'))
const TYPESCRIPT = 'typescript@5.6.3'
const TYPES_NODE = '@types/node@22.10.2'
try {
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pda-typecheck', private: true }))
  console.log(`typecheck: installing ${TYPESCRIPT} and ${TYPES_NODE} into ${dir}`)
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', TYPESCRIPT, TYPES_NODE], { cwd: dir, stdio: 'inherit' })
  const tsc = path.join(dir, 'node_modules', 'typescript', 'bin', 'tsc')
  const typeRoots = path.join(dir, 'node_modules', '@types')
  console.log('typecheck: running tsc -p tsconfig.json')
  execFileSync(process.execPath, [tsc, '-p', path.join(repo, 'tsconfig.json'), '--typeRoots', typeRoots], { cwd: repo, stdio: 'inherit' })
  console.log('typecheck: OK')
} catch (err) {
  console.error('typecheck: FAILED')
  process.exitCode = typeof err.status === 'number' && err.status !== 0 ? err.status : 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staging = mkdtempSync(join(tmpdir(), 'skill-admin-build-'))
const dist = join(root, 'dist')
try {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', staging, '--emptyOutDir'], { cwd: root, stdio: 'inherit' })
  mkdirSync(dist, { recursive: true })
  // Publish assets first and retain older hashed files for tabs opened before deploy.
  for (const entry of readdirSync(staging)) {
    if (entry !== 'index.html') cpSync(join(staging, entry), join(dist, entry), { recursive: true })
  }
  cpSync(join(staging, 'index.html'), join(dist, '.index-incoming.html'))
  renameSync(join(dist, '.index-incoming.html'), join(dist, 'index.html'))
} finally {
  rmSync(staging, { recursive: true, force: true })
}

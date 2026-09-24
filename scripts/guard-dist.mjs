// Guards dist/ against cross-project build contamination.
//
// Root cause this exists for: the preview URL was intermittently serving a
// *different* project's blank-template page ("Project Ready / Start building
// your app"). A foreign blank build had been written into this project's
// dist/assets, and stale HTML pointing at those old hashes kept rendering it.
//
// This scans every built asset for the blank-template marker and quarantines
// anything that is not this app, so a blank scaffold can never be served.
// Fail-safe by design: it never throws, so it can never break a build.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'dist', 'assets')
const QUARANTINE = join(ROOT, 'dist', '.quarantine')

const FOREIGN_MARKERS = ['Start building your app', 'Project Ready']

function quarantine(file) {
  try {
    if (!existsSync(QUARANTINE)) mkdirSync(QUARANTINE, { recursive: true })
    renameSync(join(ASSETS, file), join(QUARANTINE, file))
    return true
  } catch {
    return false
  }
}

try {
  if (!existsSync(ASSETS)) process.exit(0)

  const moved = []
  for (const file of readdirSync(ASSETS)) {
    if (!/\.(js|css)$/.test(file)) continue
    const full = join(ASSETS, file)
    try {
      if (!statSync(full).isFile()) continue
      const text = readFileSync(full, 'latin1')
      if (FOREIGN_MARKERS.some((m) => text.includes(m))) {
        if (quarantine(file)) moved.push(file)
      }
    } catch {
      // ignore individual unreadable files
    }
  }

  if (moved.length) {
    console.log(`[guard-dist] quarantined ${moved.length} foreign asset(s): ${moved.join(', ')}`)
  } else {
    console.log('[guard-dist] dist clean — no foreign project assets')
  }
} catch (err) {
  console.log(`[guard-dist] skipped: ${err?.message ?? err}`)
}

// Verifies "never fall back silently", then removes everything it created.
// Cleanup is scoped by a pre-test timestamp, so no row can be missed.
import { prisma as p } from '../src/lib/db'

const BASE = 'http://localhost:8080/api'
// Random suffix: a leftover account from an interrupted run can never block
// the next one, and no probe account can be guessed or reused.
const USER = '__probe_fallback_' + Math.random().toString(36).slice(2, 8)
// Generated per run — no credential literal is ever committed.
const PASS = 'Probe!' + Math.random().toString(36).slice(2, 12) + 'A1!'
const MARK = 'PROBE-FALLBACK-MARKER'

// Never hard-code the invite code — it is a real secret and this file is
// committed. Read it from the git-ignored file (or the env) instead.
async function readInvite() {
  if (process.env.JARVIS_INVITE_CODE) return process.env.JARVIS_INVITE_CODE.trim()
  const { readFileSync } = await import('fs')
  return readFileSync('.jarvis-invite', 'utf8').trim()
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return { _raw: t.slice(0, 200) } } }

async function main() {
  // Snapshot BEFORE anything runs: everything newer than this is ours.
  const startedAt = new Date()
  await new Promise(r => setTimeout(r, 1100))
  const INVITE = await readInvite()

  const out = []
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS, inviteCode: INVITE }),
  })
  const body = await j(reg)
  if (!body.token) throw new Error('register failed: ' + JSON.stringify(body))
  const token = body.token

  const chat = async (messages, extra = {}) => {
    const r = await fetch(`${BASE}/ai/chat?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, sessionId: 'fb', ...extra }),
    })
    return { status: r.status, body: await j(r) }
  }

  const dead = await chat([{ role: 'user', content: `Say OK. ${MARK}` }], { model: 'claude-sonnet-5' })
  out.push(`requested claude-sonnet-5 (Pro-only) -> ${dead.status}, served=${dead.body.source}, switchedFrom=${dead.body.switchedFrom}`)
  out.push(`  substitution reported: ${dead.body.switchedFrom ? 'PASS' : 'FAIL'}`)
  out.push(`  answered anyway: ${dead.body.content ? 'PASS' : 'FAIL'}`)

  const noTools = await chat([{ role: 'user', content: `Create a note titled "${MARK}-note" saying hello. ${MARK}` }], { toolsEnabled: false })
  out.push(`toolsEnabled=false -> toolsUsed=${JSON.stringify(noTools.body.toolsUsed)} ${(noTools.body.toolsUsed || []).length === 0 ? 'PASS' : 'FAIL'}`)

  const pick = await chat([{ role: 'user', content: `Reply "one". ${MARK}` }], { model: 'gpt-4.1-nano' })
  const auto = await chat([{ role: 'user', content: `Reply "two". ${MARK}` }], {})
  out.push(`explicit gpt-4.1-nano -> ${pick.body.source}; next auto turn -> ${auto.body.source} ${pick.body.source === auto.body.source ? 'PASS (sticky)' : 'FAIL (drifted)'}`)

  const fresh = await chat([{ role: 'user', content: `Reply "three". ${MARK}` }], { sessionId: 'fb-fresh' })
  out.push(`fresh session -> ${fresh.body.source}`)

  // An unknown model id must also be reported, not swallowed.
  const bogus = await chat([{ role: 'user', content: `Say OK. ${MARK}` }], { model: 'no-such-model-xyz' })
  out.push(`bogus model id -> ${bogus.status}, served=${bogus.body.source}, switchedFrom=${bogus.body.switchedFrom}`)
  out.push(`  reported: ${bogus.body.switchedFrom ? 'PASS' : 'FAIL'}`)

  console.log('\n=== FALLBACK / STICKINESS ===')
  out.forEach(x => console.log('  ' + x))

  const u = await p.authUser.findUnique({ where: { username: USER } })
  let sessions = 0
  if (u) {
    sessions = (await p.authSession.deleteMany({ where: { userId: u.id } })).count
    await p.authUser.delete({ where: { id: u.id } })
  }
  const convs = await p.conversation.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const notes = await p.note.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const mems = await p.memory.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const acts = await p.activityLog.deleteMany({ where: { createdAt: { gte: startedAt } } })

  console.log(`\nCLEANUP: conversations=${convs.count} notes=${notes.count} memories=${mems.count} sessions=${sessions} user=${u ? 'deleted' : 'absent'} activity=${acts.count}`)
  console.log('remaining users:', (await p.authUser.findMany({ select: { username: true } })).map(x => x.username).join(', '))
  console.log('remaining -> notes:', await p.note.count(), 'memories:', await p.memory.count(), 'conversations:', await p.conversation.count())
}
main().catch(e => { console.error('ERR', e.message) })

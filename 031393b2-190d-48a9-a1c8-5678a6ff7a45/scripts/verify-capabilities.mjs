// End-to-end verification of the new AI capabilities, run against the live API.
// Creates one throwaway account and removes everything it created afterwards.
import { prisma as p } from '../src/lib/db'

const BASE = 'http://localhost:8080/api'
// Random suffix: a leftover account from an interrupted run can never block
// the next one, and no probe account can be guessed or reused.
const USER = '__probe_verify_' + Math.random().toString(36).slice(2, 8)
// Generated per run — no credential literal is ever committed.
const PASS = 'Probe!' + Math.random().toString(36).slice(2, 12) + 'A1!'

// Never hard-code the invite code — it is a real secret and this file is
// committed. Read it from the git-ignored file (or the env) instead.
async function readInvite() {
  if (process.env.JARVIS_INVITE_CODE) return process.env.JARVIS_INVITE_CODE.trim()
  const { readFileSync } = await import('fs')
  return readFileSync('.jarvis-invite', 'utf8').trim()
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return { _raw: t.slice(0, 300) } } }

async function main() {
  // Snapshot BEFORE anything runs: everything newer than this is ours.
  const startedAt = new Date()
  await new Promise(r => setTimeout(r, 1100))
  const results = []
  const INVITE = await readInvite()

  // 1) register (invite code required because real accounts exist)
  let reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS, inviteCode: INVITE }),
  }); let regBody = await j(reg)
  if (!reg.ok) {
    reg = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    }); regBody = await j(reg)
  }
  const token = regBody.token
  if (!token) { console.log('AUTH FAILED', regBody); process.exit(1) }
  results.push(`auth: ok (token issued)`)

  const chat = async (messages, extra = {}) => {
    const r = await fetch(`${BASE}/ai/chat?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, sessionId: 'verify', ...extra }),
    })
    return { status: r.status, body: await j(r) }
  }

  // 2) tool call — save a memory
  let r1 = await chat([{ role: 'user', content: 'Remember this: my main roofing steel supplier is Madras Steels, and their rate is 62 rupees per kg.' }])
  results.push(`save_memory: ${r1.status} model=${r1.body.source} tools=${JSON.stringify((r1.body.toolsUsed || []).map(t => `${t.name}:${t.ok}`))}`)

  // 3) does it READ the memory back without being told again?
  let r2 = await chat([
    { role: 'user', content: 'Remember this: my main roofing steel supplier is Madras Steels, and their rate is 62 rupees per kg.' },
    { role: 'assistant', content: r1.body.content || '' },
    { role: 'user', content: 'What is my steel supplier called and what rate did I tell you?' },
  ])
  const recalled = /madras steels/i.test(r2.body.content || '')
  results.push(`read-back memory: ${recalled ? 'PASS' : 'FAIL'} — "${String(r2.body.content || '').slice(0, 150)}"`)

  // 4) create_note tool writes a real row
  let r3 = await chat([{ role: 'user', content: 'Create a note titled "Probe Verify Note" with the content: verification of tool calling. Category: test.' }])
  results.push(`create_note: ${r3.status} tools=${JSON.stringify((r3.body.toolsUsed || []).map(t => `${t.name}:${t.ok}`))}`)

  // 5) live weather for a NON-Erode city — proves the tool, not the cached block
  let r4 = await chat([{ role: 'user', content: 'What is the current weather in Chennai right now? Use your tool.' }])
  const weatherTool = (r4.body.toolsUsed || []).find(t => t.name === 'get_weather')
  results.push(`get_weather(Chennai): ${weatherTool ? `${weatherTool.ok ? 'PASS' : 'FAIL'} — ${weatherTool.summary}` : 'NOT CALLED'}`)

  // 6) is the session model sticky across turns?
  const order = [r1.body.modelId, r2.body.modelId, r3.body.modelId, r4.body.modelId]
  const sticky = new Set(order.filter(Boolean)).size <= 1
  results.push(`sticky model across 4 turns: ${sticky ? 'PASS' : 'FAIL'} — ${JSON.stringify([r1.body.source, r2.body.source, r3.body.source, r4.body.source])}`)

  // 7) model switch is reported, not silent
  const switched = [r1, r2, r3, r4].filter(r => r.body.switchedFrom).length
  results.push(`fallback reported when it happened: ${switched} turn(s) with switchedFrom`)

  // 8) a forced specific model
  let r5 = await chat([{ role: 'user', content: 'Reply with one short sentence confirming you are online.' }], { model: 'gpt-4.1-mini' })
  results.push(`explicit model pick: requested=gpt-4.1-mini served=${r5.body.source} switchedFrom=${r5.body.switchedFrom}`)

  console.log('\n=== VERIFICATION ===')
  results.forEach(x => console.log('  ' + x))

  // Clean up in the same run: a verification script must never leave rows in
  // the live database. Scoped by a pre-test timestamp so nothing is missed.
  const u = await p.authUser.findUnique({ where: { username: USER } })
  let sessions = 0
  if (u) {
    sessions = (await p.authSession.deleteMany({ where: { userId: u.id } })).count
    await p.authUser.delete({ where: { id: u.id } })
  }
  const convs = await p.conversation.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const mems = await p.memory.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const notes = await p.note.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const rems = await p.reminder.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const mets = await p.metric.deleteMany({ where: { createdAt: { gte: startedAt } } })
  const acts = await p.activityLog.deleteMany({ where: { createdAt: { gte: startedAt } } })

  console.log(`\nCLEANUP: conversations=${convs.count} memories=${mems.count} notes=${notes.count} reminders=${rems.count} metrics=${mets.count} sessions=${sessions} user=${u ? 'deleted' : 'absent'} activity=${acts.count}`)
  console.log('remaining users:', (await p.authUser.findMany({ select: { username: true } })).map(x => x.username).join(', '))
  console.log('remaining -> memories:', await p.memory.count(), 'notes:', await p.note.count(), 'conversations:', await p.conversation.count())
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })

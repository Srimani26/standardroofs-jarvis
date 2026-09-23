# Workspace Memory

## Projects
- `031393b2-190d-48a9-a1c8-5678a6ff7a45` — **J.A.R.V.I.S.** (Standard Roofs AI Assistant).
  Reconstructed from `github.com/Srimani26/standardroofs-jarvis` (85 merge conflicts
  resolved). Vite builds from that folder; the workspace root holds a mirror of
  `src/` + `custom-routes.ts` that the root API server loads. See that project's
  AGENTS.md + MEMORY.md for the full picture.

## Facts worth remembering
- The AI proxy rejects `RUNTIME_AUTH_SECRET` (`wrt_v1_*`) — use `AI_PROXY_TOKEN`.
- This pod's runtime port is **8080**; the **API** is on **3001**. `$RUNTIME_PORT` is
  unset in the shell.
- `WORKSPACE_PREVIEW_URLS` is unset, so `preview_project` errors — verify the public
  `*.preview.shogo.ai` host with curl instead.
- The **live** `custom-routes.ts` is the workspace-root copy (port 3001); the
  `031393b2-…/` copy must be mirrored to it after edits (see that project's AGENTS.md).
- `read_lints` is **misconfigured** in this workspace — it reports bogus errors
  ("Cannot find module 'hono'", "Cannot find name 'fetch'"). Use
  `bun x tsc --noEmit` instead; the only real errors are the 36 pre-existing ones
  in `src/generated/`.
- JARVIS sign-up is **invite-code gated** (`.jarvis-invite`, chmod 600, printed to the
  API log on boot). `requireAuth` guards all personal routes — the frontend must send
  the bearer token (`src/lib/api.ts`).

## Session log
- **2026-09-23 (session 2)** — Fixed "can't register a new user" + a security hole where
  `requireAuth` was never applied (settings/keys, gmail, calendar, memory, ai, github were
  world-readable/writable on the public URL). Added invite-gated registration, password
  recovery, invite code in Settings, raised rate limit 30→300, clear Gmail/Calendar
  "reconnect" errors. Gmail + Google Calendar installed (awaiting Sri's OAuth click).

# J.A.R.V.I.S. — Project Memory

**Owner:** Sri (GitHub: Srimani26)
**Repo:** github.com/Srimani26/standardroofs-jarvis

## What this is
J.A.R.V.I.S. — a personal AI assistant / command center built for Sri, an AI
automation engineer who converts manual business processes into AI automation
and builds websites with AI assistance.

Stack: Vite + React + Tailwind (frontend), Hono + Prisma over SQLite (API),
Shogo SDK for the LLM gateway and installed integration tools.

## Architecture
- **Frontend:** `src/App.tsx` plus `src/surfaces/*` — CommandCenter, AIChat,
  CodeLab, KnowledgeHub, WorkflowBuilder, TechRadar, Projects,
  HabitsTracker, Analytics, DailyPlanner, Journal, Inbox
- **API:** `custom-routes.ts` mounted at `/api/*` — auth, AI chat, memory,
  gmail, calendar, github, weather, news
- **Database:** `prisma/schema.prisma` (13 models). Regenerate with
  `bun run generate`.
- **Client helpers:** `src/lib/api.ts` (bearer-token fetch wrapper)

## Auth
- Registration is invite-code gated. The invite code lives in `.jarvis-invite`
  (gitignored) and is printed to the API log on boot.
- `requireAuth` guards every personal route. The frontend must send the bearer
  token stored in `localStorage` under `jarvis_token`.

## Operational rules
- `bun run generate` regenerates routes / hooks / types / api-client /
  `server.tsx`. It is idempotent and safe to re-run. It also runs the DB push.
- NEVER hand-edit `server.tsx` or anything in `src/generated/**`.
- NEVER commit `.jarvis-invite`, `.jarvis-secret`, `.jarvis-keys.json`,
  `*.db`, or `.env`.
- Do NOT run `git merge` inside the project. A previous merge left 85+
  unresolved conflict markers in `custom-routes.ts` and crashed the API
  server (every `/api/*` call returned 503 "API server not ready").
  Pull with `git fetch && git reset --hard origin/main` instead.
- If the app shows "API server not ready", the frontend is fine and the API
  process is down — check the build log before touching any code.

## Session log
- **2026-09-23** — invite-gated registration, password recovery, `requireAuth`
  applied across settings/gmail/calendar/memory/ai/github, rate limit
  raised 30 → 300/min.
- **2026-09-24** — repo history cleaned (no secrets in any commit);
  workspace/pod-level files (`WORKSPACE.md`, `.shogo-pool-assignment`,
  `.shogo-runtime-version`) removed so the repo can be redeployed into a
  fresh Shogo project without inheriting stale pod state.

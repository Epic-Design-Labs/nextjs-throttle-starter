<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Working in this repo

- **The block above is managed by Next.js.** On Next 16.3+, `next dev` upserts
  `AGENTS.md` and `CLAUDE.md` in place when it detects an AI coding agent
  (`node_modules/next/dist/docs/01-app/02-guides/ai-agents.md`). Content outside
  the markers is preserved. If `git status` shows one of these files dirty after
  a dev run, commit or revert it deliberately — don't sweep it into an unrelated
  commit.
- **Node 22+ is required** (`.nvmrc`, `engines`). Vitest fails on Node 20 with a
  `ERR_REQUIRE_ESM` startup error from `vite/dist/node/index.js`, which looks
  like a broken test suite rather than a wrong runtime. Check `node -v` first.
- **`npm run dev` is wrapped** by `scripts/dev-watchdog.sh` (process-group
  watchdog for a Next 16 crash hazard). Use `npm run dev:unguarded` for a bare
  `next dev`.
- **Security headers and CSP live in `src/proxy.ts`** — Next 16's replacement
  for `middleware.ts`. The CSP is composed: a base policy, a preview-only
  fragment, and a `connectorCsp` array that optional modules register into.
- **`docs/STARTER-IMPROVEMENTS.md`** is the running backlog of starter changes
  distilled from client builds. Check it before designing something new, and
  append findings after every project.

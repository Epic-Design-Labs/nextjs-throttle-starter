# `next dev` runaway processes → machine crash

_v4, updated 2026-10-05. Companion to [`scripts/dev-watchdog.sh`](../scripts/dev-watchdog.sh),
[`scripts/dev-watchdog.ps1`](../scripts/dev-watchdog.ps1) and [`scripts/dev.mjs`](../scripts/dev.mjs) —
copy all four files together when applying this to another repo._

> **v4 changes, if you read v3:** there are **two** separate causes that both end in
> hundreds of `node` processes, and v3 only described one of them. The second
> (§2, Turbopack root) is now fixed in this repo by a one-line config value and
> is worth recognising, because tuning watchdog thresholds will never find it.
> The watchdog is now real on Windows — in v3 it was a silent no-op there. Three
> factual claims from v3 are corrected at the bottom.

## TL;DR for the team

What is in this repo today:

| Piece | What it is |
|---|---|
| `package.json` → `"dev"` | `node scripts/dev.mjs` — picks the watchdog for your platform. `npm run dev` is protected automatically on macOS, Linux **and** Windows |
| `scripts/dev-watchdog.sh` | POSIX watchdog. Runs `next dev` in its own process group, kills the whole group at >12 processes or >3584 MB total RSS, restarts with backoff, gives up after 5 trips. **Refuses to start** if `pgrep`/`ps -o rss=` are missing rather than pretending to guard |
| `scripts/dev-watchdog.ps1` | Windows watchdog. Same job, but walks the real process tree via `Win32_Process.ParentProcessId` (Windows has no process groups) and kills **deepest-first**. Trips at >40 processes or >4096 MB |
| `scripts/dev.mjs` | Platform dispatcher, so nobody has to know there are two. Passes arguments through (`npm run dev -- -p 3001`) |
| `next.config.ts` → `turbopack.root` | **Prevents cause 2 below.** Not a memory setting — a correctness one |
| `npm run dev:unguarded` | Bare `next dev`, no watchdog. The escape hatch, not the default |

Day-to-day rules:

- **Nothing special needed** — `npm run dev` just works. Both watchdogs print
  `dev-watchdog: armed …` with their limits on startup, so you can tell a live
  guard from a silent one at a glance.
- **If it trips** you will see `dev-watchdog: process storm …` or
  `dev-watchdog: memory …`, then a kill and a restart. Frequent trips in one
  session mean stop and read §1/§2, not raise the threshold. Tune via
  `DEV_RSS_LIMIT_MB`, `DEV_MAX_PROCS`, `DEV_MAX_RESTARTS=0` (kill-only).
- **Never bypass it** — do not run `node_modules/.bin/next dev` directly, do not
  re-add a bare `next dev` as `"dev"`, and do not "simplify" to heap caps:
  `--max-old-space-size` alone *lowers* Next's 80% restart trip-wire and
  accelerates the spiral (counterintuitive, see §3).
- **For browsing and demos** prefer `npm run build && npm run start` —
  production mode is immune. Never rebuild while that server is running (§5).
- **One machine, one dev server.** Before starting one, check:
  - macOS/Linux: `pgrep -fl "next dev"`
  - Windows: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' } | Select-Object ProcessId, CommandLine`
  An unprotected dev server in *any* repo can take the whole machine down.
- **Removal condition:** when [vercel/next.js#85666](https://github.com/vercel/next.js/issues/85666)
  closes **and** the restart loop is gated, the watchdogs can come out.
  **Still open as of 2026-10-05** (filed 2025-11-01, no fix, no linked PR), and
  the leak still reproduces here — see the measurements in §1.

---

## The two causes

Both end with the same symptom — a `next dev` that spawns `node` processes until
the machine dies — and they need different fixes. Identify which one you have
before touching anything.

| | Cause 1: the leak + restart storm | Cause 2: Turbopack root |
|---|---|---|
| **Trigger** | Sustained requests / HMR recompiles | A wrong module-resolution root |
| **Tell in the dev log** | `Server is approaching the used memory threshold, restarting...` | `Error: Can't resolve 'tailwindcss' in '<some dir outside the project>'` |
| **Tell in the process list** | Many short-lived whole dev servers, each multi-GB | Many `.next/dev/build/postcss.js` workers |
| **Onset** | Minutes to hours of work | Immediately, on the first page compile |
| **Fixed in this repo?** | **No** — upstream, mitigated by the watchdog only | **Yes** — `turbopack.root` in `next.config.ts` |

---

## 1. The leak and the restart storm (upstream, NOT fixed)

1. **The leak** ([#85666](https://github.com/vercel/next.js/issues/85666)): `next dev`
   retains memory per request and per HMR recompile with no upper bound. Worse
   under Turbopack; webpack roughly half the rate.
2. **The restart storm — the actual machine-killer.** Next dev has a per-request
   memory watcher: when the V8 heap passes **80% of its limit** the server
   `process.exit(77)`s (`next/dist/server/lib/start-server.js`) and the parent
   CLI **respawns it instantly, with no backoff and no restart cap**
   (`next/dist/cli/next-dev.js`). `__NEXT_DISABLE_MEMORY_WATCHER` does not gate
   this path. Under memory pressure the dying multi-GB servers (GC and
   trace-flush on exit) **outlive their replacements**, so ghost processes
   accumulate until the OS starts killing things. On a 32 GB iMac this froze the
   machine four times in one day, *with* heap caps applied.

### It still reproduces — measured on this repo, 2026-10-05

Next 16.2.3, Windows, `npm run dev` on `main` with every current fix merged. Two
identical bursts of 300 requests across `/`, `/shop`, `/search?q=…`, `/cart`,
`/sitemap`, sampling total RSS of the dev process tree:

| Point | Processes | RSS |
|---|---|---|
| After warmup (routes compiled) | 2 | **1640 MB** |
| After 300 requests | 2 | 2624 MB |
| …20s idle, settled | 2 | **2310 MB** |
| After 600 requests | 2 | 3199 MB |
| …20s idle, settled | 2 | **2904 MB** |

Burst 1 retained **+670 MB**, burst 2 retained **+594 MB** — near-linear, no
plateau, about **2 MB per request** that GC never returns. That is the leak, not
cache warming; cache warming would flatten on the second identical burst.

At that rate the 4096 MB tripwire is roughly 600 more requests away, and Next's
own 80% heap trip-wire fires before that. **This is why the watchdog stays.**

## 2. Turbopack resolving from the wrong root (FIXED here)

Different mechanism, same body count.

Turbopack resolves every bare specifier from its **project root**. Point that
root outside the project and `tailwindcss` becomes unresolvable from
`postcss.config.mjs` — and Turbopack **respawns a PostCSS worker per failed
transform**, unbounded. On one client build that reached **764 node processes
(~42 GB) and hard-crashed the host twice**.

Two ways to get a wrong root, and the first is the trap:

- **`turbopack: { root: __dirname }`** — Next **transpiles `next.config.ts`
  before evaluating it**, so `__dirname` resolves to the project's *parent*.
  The config looks obviously correct and is not.
- **Leaving it unset** — Next infers the root by walking up for a lockfile, so a
  stray `package-lock.json` anywhere above the project (even at the drive root)
  silently wins. The only signal is a build warning most people scroll past:
  `⚠ Next.js inferred your workspace root, but it may not be correct.`

Both are closed by pinning it, which is what `next.config.ts` now does:

```ts
turbopack: {
  root: process.cwd(),
},
```

`process.cwd()` is right because every Next CLI entry point runs from the
directory holding the config — that is how the config was found at all.

**Reproduced and fixed here, 2026-10-05.** Before the fix, on this machine, a
single `npm run dev` produced `Can't resolve 'tailwindcss' in 'C:\projects'`,
repeated V8 fatal OOMs, and a watchdog trip at **73 processes**; **69 orphaned
`postcss.js` workers** holding 4.4 GB survived, because PowerShell itself threw
`OutOfMemoryException` mid-cleanup. After the fix the same command holds **2
processes, 1 postcss worker**, RSS declining, every page 200.

> If you are chasing "hundreds of node processes" and the log says
> `Can't resolve …`, you are in §2 and no amount of watchdog tuning will help.
> Check `turbopack.root` first.

## 3. Why the obvious mitigations fail

- **`--max-old-space-size=3072` makes the churn worse.** It lowers the 80%
  trip-wire from ~3.2 GB to ~2.4 GB, so the exit-77 respawn fires sooner and
  more often. (A hard OOM abort/SIGABRT does *not* respawn — only the exit-77
  watcher path does, which is why the heap cap belongs *inside* the watchdog,
  where a SIGABRT is a clean, non-respawning death it can handle.)
- **`experimental.turbopackMemoryLimit` is an advisory GC target, not a cap.**
  It is not currently set in this repo (v3 of this doc claimed it was).
- **A watchdog that checks per-process RSS is structurally blind to the storm.**
  macOS compresses the ghosts' pages, so each shows ~26 MB resident while
  collectively holding 50 GB. No single process ever crosses a per-process
  threshold — which is why both watchdogs here sum the **whole group/tree**.

## 4. Diagnosing it after the fact

**macOS.** Read `/Library/Logs/DiagnosticReports/JetsamEvent-*.ips` — each lists
every process at the moment of memory exhaustion (name, rpages, age). Thousands
of `node` entries with median ~26 MB resident and ages spanning minutes is the
restart storm. `~/Library/Logs/DiagnosticReports/node-*.ips` with `SIGABRT` is a
heap-cap OOM abort.

**Windows.** There is no jetsam log; inspect the survivors directly, and let the
command line tell you which cause you hit:

```powershell
# What survived, and what is it?
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId,
    @{n='MB';e={[math]::Round($_.WorkingSetSize/1MB)}}, CommandLine |
  Sort-Object MB -Descending | Format-Table -Wrap

# Many rows whose CommandLine contains .next\dev\build\postcss.js  -> cause 2
# Many rows that are whole `next dev` servers                      -> cause 1
```

Clean up strays from this project only:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*<your-repo-name>*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 5. Rules of thumb

- **Production is immune** — `next build && next start` holds a flat ~300 MB.
  Use prod mode for browsing and demos; dev mode only for real HMR work, always
  behind the watchdog.
- **Never rebuild under a running `next start`.** The server keeps the old
  build's manifests in memory while the disk gets new chunks; every client-side
  navigation then hits a build-ID mismatch and hard-reload loops until the
  browser kills the tab. Kill the server, `next build`, then `next start`.
  Vercel is unaffected — its builds land on fresh, immutable deployments.
- **Never run `next dev` anywhere on the machine without a watchdog.** One
  unprotected repo takes down everything (we once found another repo's sitting
  at 1.5 GB mid-session).
- **Never edit a running shell script in place** — bash re-reads by byte offset,
  which is undefined behaviour.
- **Delete `.next` when switching between `build` and `dev`.** With
  `.next/server/app/<slug>.html` present from an earlier build, dev serves it
  and makes **no outbound request at all** — against a live catalog that showed
  a sold item as purchasable days later, and looked exactly like a broken data
  layer. The tell: delete `.next/cache/fetch-cache` and it is never recreated —
  a render that makes no network call cannot be a stale-cache problem.
- Watch **#85666**. The ungated heap-watcher restart loop with no backoff
  deserves its own upstream issue; it is the part that kills machines.

---

## Corrections to v3 of this doc

Recorded because v3 is still in circulation in other repos:

1. **`next.config.ts → turbopackMemoryLimit` was never in this repo.** v3's TL;DR
   listed it as present "since commit `1d47483`". The config carries
   `turbopack.root` (for §2) and no memory setting.
2. **`package.json → "dev"` is `node scripts/dev.mjs`**, not
   `bash scripts/dev-watchdog.sh`. The dispatcher exists because the watchdog
   had to be written twice.
3. **"Nothing special needed — the watchdog is invisible" was false on Windows.**
   `dev-watchdog.sh` detects storms with `pgrep -g` and `ps -o rss=`; Git Bash
   ships neither, so the tripwire block was skipped every second and the script
   supervised nothing while printing the dev server's normal output. A guard
   that reports success and does nothing is worse than no guard. Fixed by the
   `.ps1` plus the dispatcher; the `.sh` now refuses to start rather than
   pretending.
4. v3 attributed every runaway-process incident to the leak. §2 is a second,
   independent cause with a different fix and a different tell.

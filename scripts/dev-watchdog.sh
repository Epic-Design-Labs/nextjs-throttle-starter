#!/usr/bin/env bash
# Memory + process-storm watchdog for `next dev`.
#
# Why this exists (post-mortem of the 2026-06-05 machine crashes):
#   1. `next dev` leaks memory per request / HMR recompile (vercel/next.js#85666).
#   2. When the V8 heap passes 80% of its limit, the dev server exits(77) at the
#      end of the next request ("Server is approaching the used memory
#      threshold, restarting..." — next/dist/server/lib/start-server.js) and the
#      parent CLI respawns it instantly with no backoff and no restart cap
#      (next/dist/cli/next-dev.js). Ungated in 16.2.3 through 16.2.7.
#   3. Under system memory pressure the dying, bloated servers outlive their
#      replacements. macOS compresses their pages, so per-process RSS looks
#      tiny while ~2,000 ghost node processes hold 50+ GB → jetsam storm →
#      machine freeze. (Evidence: /Library/Logs/DiagnosticReports/JetsamEvent-*.)
#
# Defense: run `next dev` in its own process group, poll every second, and
# hard-kill the ENTIRE GROUP when either tripwire fires:
#   - group process count exceeds DEV_MAX_PROCS  (catches the restart storm —
#     per-process memory checks cannot, because compressed ghosts look small)
#   - group total resident memory exceeds DEV_RSS_LIMIT_MB
# Then restart with backoff, and give up after DEV_MAX_RESTARTS.
#
# Remove once the upstream leak + ungated restart loop are fixed.
#
# Overrides:
#   DEV_RSS_LIMIT_MB=3000 npm run dev   # total MB across the dev process group
#   DEV_MAX_PROCS=8       npm run dev   # storm detector threshold
#   DEV_MAX_RESTARTS=0    npm run dev   # disable auto-restart (kill only)
#   DEV_WATCHDOG_CMD=...                # command to supervise (for self-tests)
set -u
set -m # job control: the background job below gets its own process group

LIMIT_MB="${DEV_RSS_LIMIT_MB:-3584}"
MAX_PROCS="${DEV_MAX_PROCS:-12}"
MAX_RESTARTS="${DEV_MAX_RESTARTS:-5}"
INTERVAL_S=1

cd "$(dirname "$0")/.." || exit 1

# Arm check. Both tripwires below depend on `pgrep -g` and `ps -o rss=`. Neither
# exists on Windows: Git Bash ships no pgrep, and its `ps` has no RSS column. The
# polling loop would then skip its tripwire block every second and supervise
# nothing while printing the dev server's normal output, which looks healthy.
# That is worse than no watchdog, so refuse rather than pretend.
if ! command -v pgrep >/dev/null 2>&1 || ! ps -o rss= -p $$ >/dev/null 2>&1; then
  echo "" >&2
  echo "dev-watchdog: pgrep and/or 'ps -o rss=' unavailable - the watchdog CANNOT arm." >&2
  case "$(uname -s 2>/dev/null)" in
    MINGW* | MSYS* | CYGWIN*)
      echo "dev-watchdog: this is the POSIX watchdog running on Windows." >&2
      echo "dev-watchdog: run 'npm run dev', which dispatches to scripts/dev-watchdog.ps1." >&2
      ;;
    *)
      echo "dev-watchdog: install procps (pgrep), or run 'npm run dev:unguarded'." >&2
      ;;
  esac
  echo "" >&2
  exit 1
fi

# Say the limits out loud. Without this there is no way to tell an armed
# watchdog from one that is quietly doing nothing - which is how the Windows
# no-op survived unnoticed.
echo "dev-watchdog: armed (POSIX). Limits: ${MAX_PROCS} processes, ${LIMIT_MB} MB total, ${MAX_RESTARTS} restarts."

# shellcheck disable=SC2206 # intentional word-splitting of the override
CMD=(${DEV_WATCHDOG_CMD:-node_modules/.bin/next dev})

DEV_PID=""

kill_group() {
  [ -n "$DEV_PID" ] || return 0
  kill -9 -"$DEV_PID" 2>/dev/null # negative pid = whole process group
  kill -9 "$DEV_PID" 2>/dev/null
}

trap 'kill_group; exit 130' INT TERM
trap 'kill_group' EXIT

restarts=0
while true; do
  NODE_OPTIONS="--max-old-space-size=3072" "${CMD[@]}" "$@" &
  DEV_PID=$!
  tripped=""

  while kill -0 "$DEV_PID" 2>/dev/null; do
    pids=$(pgrep -g "$DEV_PID" 2>/dev/null)
    if [ -n "$pids" ]; then
      count=$(echo "$pids" | wc -l | tr -d ' ')
      total_kb=$(ps -o rss= -p "$(echo "$pids" | tr '\n' ',' | sed 's/,$//')" 2>/dev/null |
        awk '{s+=$1} END {print s+0}')
      if [ "$count" -gt "$MAX_PROCS" ]; then
        tripped="process storm: $count processes in dev group (limit $MAX_PROCS)"
      elif [ "$total_kb" -gt $((LIMIT_MB * 1024)) ]; then
        tripped="memory: $((total_kb / 1024)) MB total across $count processes (limit ${LIMIT_MB} MB)"
      fi
      if [ -n "$tripped" ]; then
        echo "" >&2
        echo "⛔ dev-watchdog: $tripped" >&2
        echo "⛔ Killing the entire dev process group to protect the machine." >&2
        echo "⛔ (next.js#85666 leak + ungated dev-server restart loop — see header)" >&2
        kill_group
        break
      fi
    fi
    sleep "$INTERVAL_S"
  done

  if [ -z "$tripped" ]; then
    # Dev server exited on its own (Ctrl-C, fatal error, OOM abort) — don't
    # resurrect automatically; surface the exit code instead.
    wait "$DEV_PID" 2>/dev/null
    code=$?
    DEV_PID=""
    exit "$code"
  fi

  restarts=$((restarts + 1))
  if [ "$restarts" -gt "$MAX_RESTARTS" ]; then
    echo "⛔ dev-watchdog: tripped $restarts times — giving up. Investigate before restarting." >&2
    exit 137
  fi
  echo "♻️  dev-watchdog: restarting dev server in 3s (restart $restarts/$MAX_RESTARTS)…" >&2
  sleep 3
done

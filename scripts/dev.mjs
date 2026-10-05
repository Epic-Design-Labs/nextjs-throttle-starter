#!/usr/bin/env node
//
// Platform dispatcher for `npm run dev`.
//
// The dev server runs under a watchdog (see scripts/dev-watchdog.sh for the
// post-mortem that motivated it), and the watchdog has to be written twice:
// the POSIX version needs `pgrep -g` + `ps -o rss=`, neither of which exists on
// Windows, and the Windows version needs Win32_Process to walk a tree that has
// no process groups. This picks the right one so nobody has to know that.
//
// Before this existed, `npm run dev` ran `./scripts/dev-watchdog.sh` directly,
// which on Windows either failed outright under cmd.exe ("'.' is not
// recognized") or, under Git Bash, ran and silently supervised nothing.
//
// `npm run dev:unguarded` remains the escape hatch: a bare `next dev`.

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectDir = join(scriptsDir, "..")
const passthrough = process.argv.slice(2)

const isWindows = process.platform === "win32"
const watchdog = join(scriptsDir, isWindows ? "dev-watchdog.ps1" : "dev-watchdog.sh")

if (!existsSync(watchdog)) {
  console.error(`dev: watchdog script not found at ${watchdog}`)
  console.error("dev: run `npm run dev:unguarded` for a bare next dev.")
  process.exit(1)
}

// PowerShell 7 if it is installed, otherwise Windows PowerShell 5.1, which ships
// with the OS. -ExecutionPolicy Bypass because a local dev script is not signed
// and the default policy (RemoteSigned/Restricted) would refuse to run it.
const [command, args] = isWindows
  ? [
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", watchdog, ...passthrough],
    ]
  : ["bash", [watchdog, ...passthrough]]

const child = spawn(command, args, {
  cwd: projectDir,
  stdio: "inherit",
  // Not `shell: true`: the paths are ours, and a shell would add a process
  // layer between this dispatcher and the watchdog's own tree bookkeeping.
  shell: false,
})

child.on("error", (err) => {
  console.error(`dev: could not start ${command}: ${err.message}`)
  if (isWindows) {
    console.error("dev: PowerShell is required for the Windows watchdog.")
  } else {
    console.error("dev: bash is required for the POSIX watchdog.")
  }
  console.error("dev: run `npm run dev:unguarded` for a bare next dev.")
  process.exit(1)
})

// Ctrl-C reaches the child directly (same console/process group), so the
// watchdog runs its own cleanup. Don't kill it from here as well, or the
// cleanup races. Just mirror however it ended.
child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 0
})

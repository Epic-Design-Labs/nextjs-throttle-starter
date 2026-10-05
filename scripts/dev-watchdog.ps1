# Memory + process-storm watchdog for `next dev` on Windows.
#
# This is the Windows half of scripts/dev-watchdog.sh. Keep the two in sync.
#
# Why a second implementation instead of one portable script: the POSIX version
# detects a runaway dev server with `pgrep -g` (process group) and `ps -o rss=`.
# Neither exists on Windows. Git Bash has no pgrep at all and its `ps` reports no
# RSS column, so on Windows the .sh silently skipped its own tripwire block every
# second and supervised nothing while looking perfectly healthy. A guard that
# reports success and does nothing is worse than no guard.
#
# What it guards (see the header of dev-watchdog.sh for the full post-mortem):
#   1. `next dev` leaks memory per request / HMR recompile (vercel/next.js#85666).
#   2. Past the heap threshold the dev server exits(77) and the parent CLI
#      respawns it instantly, with no backoff and no restart cap.
#   3. A misconfigured turbopack.root makes Turbopack respawn a PostCSS worker
#      per failed transform. On one client build that reached 764 node processes
#      and about 42 GB, and hard-crashed the host twice. See next.config.ts.
#
# Defense: poll the real process tree every second and kill ALL of it when either
# tripwire fires. Windows has no process groups, so the tree is walked through
# Win32_Process.ParentProcessId and killed deepest-first, otherwise killing a
# parent orphans its children and they keep running.
#
# IMPORTANT: this file must stay pure ASCII. PowerShell 5.1 decodes a BOM-less
# file as ANSI, so a smart quote or an em dash becomes a parse error on machines
# whose code page differs from the author's.
#
# Tuning (same names as the POSIX script):
#   $env:DEV_RSS_LIMIT_MB = 4096   # total MB across the dev process tree
#   $env:DEV_MAX_PROCS    = 40     # storm detector threshold
#   $env:DEV_MAX_RESTARTS = 0      # disable auto-restart (kill only)
#   $env:DEV_WATCHDOG_CMD = "..."  # command to supervise (for self-tests)
#
# The Windows defaults are deliberately looser than the POSIX ones (40 vs 12
# processes, 4096 vs 3584 MB): a healthy `next dev` on Windows carries more
# helper processes, and the tree walk counts every descendant rather than one
# process group.

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-IntSetting([string]$Name, [int]$Default) {
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    $parsed = 0
    if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge 0) { return $parsed }
    return $Default
}

$LimitMb     = Get-IntSetting 'DEV_RSS_LIMIT_MB' 4096
$MaxProcs    = Get-IntSetting 'DEV_MAX_PROCS'    40
$MaxRestarts = Get-IntSetting 'DEV_MAX_RESTARTS' 5
$IntervalSec = 1

Set-Location (Join-Path $PSScriptRoot '..')

# Arm check. If the tree walk is unavailable, say so and refuse to run rather
# than supervising nothing. This is the exact failure this script exists to fix.
try {
    $null = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop
} catch {
    Write-Host ''
    Write-Host 'dev-watchdog: cannot read Win32_Process, so the watchdog CANNOT arm.' -ForegroundColor Red
    Write-Host "dev-watchdog: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'dev-watchdog: run `npm run dev:unguarded` if you accept the risk.' -ForegroundColor Red
    Write-Host ''
    exit 1
}

Write-Host "dev-watchdog: armed (Windows). Limits: $MaxProcs processes, $LimitMb MB total, $MaxRestarts restarts."

# Every descendant of $RootPid, plus the root, deepest-first.
# Deepest-first matters on kill: killing a parent first orphans its children and
# they survive, which is how a storm outlives the server that spawned it.
function Get-ProcessTree([int]$RootPid) {
    $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, WorkingSetSize -ErrorAction SilentlyContinue)
    $childrenOf = @{}
    foreach ($proc in $all) {
        $parent = [int]$proc.ParentProcessId
        if (-not $childrenOf.ContainsKey($parent)) { $childrenOf[$parent] = New-Object System.Collections.ArrayList }
        $null = $childrenOf[$parent].Add($proc)
    }

    $byPid = @{}
    foreach ($proc in $all) { $byPid[[int]$proc.ProcessId] = $proc }

    $ordered = New-Object System.Collections.ArrayList
    $queue = New-Object System.Collections.Queue
    if ($byPid.ContainsKey($RootPid)) {
        $queue.Enqueue($byPid[$RootPid])
        $null = $ordered.Add($byPid[$RootPid])
    }
    $seen = @{ $RootPid = $true }

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $currentPid = [int]$current.ProcessId
        if (-not $childrenOf.ContainsKey($currentPid)) { continue }
        foreach ($child in $childrenOf[$currentPid]) {
            $childPid = [int]$child.ProcessId
            # A recycled pid could point back up the tree and loop forever.
            if ($seen.ContainsKey($childPid)) { continue }
            $seen[$childPid] = $true
            $null = $ordered.Add($child)
            $queue.Enqueue($child)
        }
    }

    # Breadth-first order reversed is deepest-first.
    $ordered.Reverse()
    # Comma operator: without it PowerShell unrolls a one-element collection to
    # a bare object, and the caller's $tree.Count then throws under StrictMode.
    return ,$ordered
}

function Stop-ProcessTree([int]$RootPid) {
    if ($RootPid -le 0) { return }
    foreach ($proc in (Get-ProcessTree $RootPid)) {
        try { Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction SilentlyContinue } catch { }
    }
    try { Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue } catch { }
}

$command = [Environment]::GetEnvironmentVariable('DEV_WATCHDOG_CMD')
if ([string]::IsNullOrWhiteSpace($command)) {
    # Call the CLI entry directly rather than node_modules/.bin/next.cmd: the cmd
    # shim adds a process layer that complicates both the tree walk and the kill.
    $exe = 'node'
    $argv = @('node_modules/next/dist/bin/next', 'dev') + $args
} else {
    $parts = $command -split '\s+'
    $exe = $parts[0]
    $argv = @($parts[1..($parts.Length - 1)]) + $args
}

$env:NODE_OPTIONS = '--max-old-space-size=3072'

$devProcess = $null
$restarts = 0

try {
    while ($true) {
        $devProcess = Start-Process -FilePath $exe -ArgumentList $argv -NoNewWindow -PassThru
        $devPid = $devProcess.Id
        $tripped = ''

        while (-not $devProcess.HasExited) {
            # No @() wrapper: Get-ProcessTree already returns the ArrayList
            # itself (via the comma operator), and @() would wrap that single
            # object in another array of one.
            $tree = Get-ProcessTree $devPid
            $count = $tree.Count
            $totalMb = 0
            foreach ($proc in $tree) {
                if ($null -ne $proc.WorkingSetSize) { $totalMb += [int]([int64]$proc.WorkingSetSize / 1MB) }
            }

            if ($count -gt $MaxProcs) {
                $tripped = "process storm: $count processes in the dev tree (limit $MaxProcs)"
            } elseif ($totalMb -gt $LimitMb) {
                $tripped = "memory: $totalMb MB total across $count processes (limit $LimitMb MB)"
            }

            if ($tripped) {
                Write-Host ''
                Write-Host "dev-watchdog: $tripped" -ForegroundColor Red
                Write-Host 'dev-watchdog: killing the entire dev process tree to protect the machine.' -ForegroundColor Red
                Write-Host 'dev-watchdog: (next.js#85666 leak + ungated dev-server restart loop, see header)' -ForegroundColor Red
                Stop-ProcessTree $devPid
                break
            }

            Start-Sleep -Seconds $IntervalSec
        }

        if (-not $tripped) {
            # Exited on its own (Ctrl-C, fatal error, OOM abort). Do not
            # resurrect it; surface the exit code instead.
            $devProcess.WaitForExit()
            $code = $devProcess.ExitCode
            $devProcess = $null
            exit $code
        }

        $restarts++
        if ($restarts -gt $MaxRestarts) {
            Write-Host "dev-watchdog: tripped $restarts times, giving up. Investigate before restarting." -ForegroundColor Red
            exit 137
        }
        Write-Host "dev-watchdog: restarting dev server ($restarts of $MaxRestarts)." -ForegroundColor Yellow
    }
} finally {
    # Covers Ctrl-C and any terminating error. Without this the tree outlives the
    # watchdog, which is the scenario that crashed the host.
    if ($null -ne $devProcess -and -not $devProcess.HasExited) {
        Stop-ProcessTree $devProcess.Id
    }
}

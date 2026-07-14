#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Repo validation entry point.

.DESCRIPTION
    Usage: ./validate.ps1 [phase]
    Phases mirror the webapp-template validator:
      all        - root typecheck/lint/test + webapp validate
      full       - all + webapp full validation
      continuity - repo continuity freshness
      precommit  - fast local sanity
      prepush    - medium local gate
      quick      - typecheck only
      test       - tests only
      e2e        - webapp Playwright E2E only
      quality    - root lint metrics + webapp quality metrics
      commit     - validate all + continuity, then commit + push
#>

param(
    [ValidateSet("all", "full", "continuity", "precommit", "prepush", "quick", "test", "e2e", "quality", "commit")]
    [string]$Phase = "all"
)

$ErrorActionPreference = "Stop"

if ($Host.UI -and $Host.UI.RawUI) {
    $Host.UI.RawUI.WindowTitle = "click-tt-automation validate"
}

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Pass($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

function Invoke-ShellCommand([string]$commandLine, [switch]$CaptureOutput) {
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        if ($CaptureOutput) {
            $output = cmd /c $commandLine 2>&1
        } else {
            cmd /c $commandLine | Out-Host
        }
    } else {
        if ($CaptureOutput) {
            $output = /bin/sh -lc $commandLine 2>&1
        } else {
            /bin/sh -lc $commandLine | Out-Host
        }
    }

    if ($CaptureOutput) {
        return @{
            ExitCode = $LASTEXITCODE
            Output = @($output)
        }
    }

    return $LASTEXITCODE
}

function Invoke-NativeCommand([string]$commandLine) {
    $previousErrorActionPreference = $ErrorActionPreference
    $script:ErrorActionPreference = "Continue"
    try {
        return Invoke-ShellCommand $commandLine
    } finally {
        $script:ErrorActionPreference = $previousErrorActionPreference
    }
}

function Invoke-NativeCommandCaptured([string]$commandLine) {
    $previousErrorActionPreference = $ErrorActionPreference
    $script:ErrorActionPreference = "Continue"
    try {
        return Invoke-ShellCommand $commandLine -CaptureOutput
    } finally {
        $script:ErrorActionPreference = $previousErrorActionPreference
    }
}

function Remove-Ansi([string]$text) {
    if (-not $text) { return $text }
    return [regex]::Replace($text, '\x1B\[[0-9;]*[A-Za-z]', '')
}

function Invoke-Check([string]$Name, [string]$Command, [switch]$Capture, [scriptblock]$Summarize) {
    Write-Step $Name
    try {
        if ($Capture) {
            $result = Invoke-NativeCommandCaptured $Command
            if ($result.ExitCode -ne 0) {
                $result.Output | Out-Host
                throw "$Name failed"
            }
            if ($Summarize) {
                & $Summarize $result.Output
            } else {
                Write-Pass "$Name passed"
            }
            return
        }

        $exitCode = Invoke-NativeCommand $Command
        if ($exitCode -ne 0) { throw "$Name failed" }
        Write-Pass "$Name passed"
    } catch {
        Write-Fail "$Name failed"
        $script:failures += $Name
    }
}

function Summarize-Vitest($output) {
    $filesLine = $output | Select-String -Pattern 'Test Files\s+(\d+)\s+passed' | Select-Object -Last 1
    $testsLine = $output | Select-String -Pattern 'Tests\s+(\d+)\s+passed' | Select-Object -Last 1
    $durationLine = $output | Select-String -Pattern 'Duration\s+(.+)$' | Select-Object -Last 1

    $parts = @()
    if ($filesLine -and $filesLine.Matches.Count -gt 0) { $parts += "$($filesLine.Matches[0].Groups[1].Value) files" }
    if ($testsLine -and $testsLine.Matches.Count -gt 0) { $parts += "$($testsLine.Matches[0].Groups[1].Value) tests" }
    if ($durationLine) { $parts += ((Remove-Ansi($durationLine.Line) -replace '^\s*Duration\s+', '').Trim()) }

    if ($parts.Count -gt 0) {
        Write-Pass "tests passed ($($parts -join ', '))"
    } else {
        Write-Pass "tests passed"
    }
}

function Summarize-Eslint($output) {
    $cleanOutput = @($output | ForEach-Object { Remove-Ansi ([string]$_) })
    $summaryLine = $cleanOutput |
        Select-String -Pattern '(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)' |
        Select-Object -Last 1
    $complexityMatches = @($cleanOutput | Select-String -Pattern 'has a complexity of (\d+)')
    $lineMatches = @($cleanOutput | Select-String -Pattern 'has too many lines \((\d+)\)')

    $parts = @()
    if ($summaryLine -and $summaryLine.Matches.Count -gt 0) {
        $parts += "$($summaryLine.Matches[0].Groups[2].Value) errors"
        $parts += "$($summaryLine.Matches[0].Groups[3].Value) warnings"
    } else {
        $parts += "0 warnings"
    }
    if ($complexityMatches.Count -gt 0) {
        $scores = @($complexityMatches | ForEach-Object { [int]$_.Matches[0].Groups[1].Value })
        $parts += "max complexity $(($scores | Measure-Object -Maximum).Maximum)"
    }
    if ($lineMatches.Count -gt 0) {
        $scores = @($lineMatches | ForEach-Object { [int]$_.Matches[0].Groups[1].Value })
        $parts += "max function lines $(($scores | Measure-Object -Maximum).Maximum)"
    }

    Write-Pass "lint passed ($($parts -join ', '))"
}

function Invoke-WebappValidate([string]$WebappPhase) {
    Invoke-Check "Webapp validate ($WebappPhase)" "cd webapp && pwsh -NoProfile -ExecutionPolicy Bypass -File validate.ps1 $WebappPhase"
}

$failures = @()

if ($Phase -in "all", "full", "precommit", "quick", "commit") {
    Invoke-Check "Root typecheck" "pnpm run typecheck"
}

if ($Phase -in "all", "full", "prepush", "quality", "commit") {
    Invoke-Check "Root lint metrics" "pnpm run lint" -Capture -Summarize ${function:Summarize-Eslint}
}

if ($Phase -in "all", "full", "test", "commit") {
    Invoke-Check "Root tests" "pnpm test" -Capture -Summarize ${function:Summarize-Vitest}
}

switch ($Phase) {
    "all" { Invoke-WebappValidate "all" }
    "full" { Invoke-WebappValidate "full" }
    "precommit" { Invoke-WebappValidate "precommit" }
    "prepush" { Invoke-WebappValidate "prepush" }
    "quick" { Invoke-WebappValidate "quick" }
    "test" { Invoke-WebappValidate "test" }
    "e2e" { Invoke-WebappValidate "e2e" }
    "quality" { Invoke-WebappValidate "quality" }
    "continuity" {
        Invoke-Check "Continuity refresh check" "pnpm run continuity:update"
    }
    "commit" {
        Invoke-Check "Continuity refresh" "pnpm run continuity:update"
    }
}

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures -join ', ')" -ForegroundColor Red
    Write-Host "Fix failures before proceeding." -ForegroundColor Yellow
    exit 1
}

Write-Host "ALL CHECKS PASSED" -ForegroundColor Green

if ($Phase -eq "commit") {
    Write-Step "Git commit"
    git add -A
    $msg = Read-Host "Commit message"
    if ($msg) {
        git commit -m $msg
        Write-Pass "committed: $msg"
        $branch = git branch --show-current
        git push origin $branch
    } else {
        Write-Host "Commit skipped (empty message)" -ForegroundColor Yellow
    }
}

#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Backpressure script - runs after each task to validate the build.

.DESCRIPTION
    Usage: ./validate.ps1 [phase]
    Phases:
      all      - typecheck + lint + test (default)
      quick    - typecheck only (use during scaffolding before tests exist)
      test     - tests only
      quality  - typecheck + lint (no tests)
#>

param(
    [ValidateSet("all", "quick", "test", "quality")]
    [string]$Phase = "all"
)

$ErrorActionPreference = "Stop"

if ($Host.UI -and $Host.UI.RawUI) {
    $Host.UI.RawUI.WindowTitle = "click-tt-automation validate"
}

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Pass($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  [SKIP] $msg" -ForegroundColor Yellow }

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
    if (-not $text) {
        return $text
    }

    return [regex]::Replace($text, '\x1B\[[0-9;]*[A-Za-z]', '')
}

$failures = @()

if ($Phase -in "all", "quick", "quality") {
    Write-Step "Typecheck (tsc --noEmit)"
    try {
        $exitCode = Invoke-NativeCommand "npm run typecheck"
        if ($exitCode -ne 0) { throw "typecheck failed" }
        Write-Pass "typecheck passed"
    } catch {
        Write-Fail "typecheck failed"
        $failures += "typecheck"
    }
}

if ($Phase -in "all", "quality") {
    Write-Step "Lint (eslint)"
    try {
        $exitCode = Invoke-NativeCommand "npm run lint"
        if ($exitCode -ne 0) { throw "lint failed" }
        Write-Pass "lint passed"
    } catch {
        Write-Fail "lint failed"
        $failures += "lint"
    }
}

if ($Phase -in "all", "test") {
    Write-Step "Tests (vitest)"
    try {
        $result = Invoke-NativeCommandCaptured "npm test"
        if ($result.ExitCode -ne 0) {
            $result.Output | Out-Host
            throw "tests failed"
        }

        $filesLine = $result.Output |
            Select-String -Pattern 'Test Files\s+(\d+)\s+passed' |
            Select-Object -Last 1
        $testsLine = $result.Output |
            Select-String -Pattern 'Tests\s+(\d+)\s+passed' |
            Select-Object -Last 1
        $durationLine = $result.Output |
            Select-String -Pattern 'Duration\s+(.+)$' |
            Select-Object -Last 1

        $parts = @()
        if ($filesLine -and $filesLine.Matches.Count -gt 0) {
            $parts += "$($filesLine.Matches[0].Groups[1].Value) files"
        }
        if ($testsLine -and $testsLine.Matches.Count -gt 0) {
            $parts += "$($testsLine.Matches[0].Groups[1].Value) tests"
        }
        if ($durationLine) {
            $durationText = (Remove-Ansi($durationLine.Line) -replace '^\s*Duration\s+', '').Trim()
            $parts += $durationText
        }

        if ($parts.Count -gt 0) {
            Write-Pass "tests passed ($($parts -join ', '))"
        } else {
            Write-Pass "tests passed"
        }
    } catch {
        Write-Fail "tests failed"
        $failures += "tests"
    }
}

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures -join ', ')" -ForegroundColor Red
    Write-Host "Fix failures before proceeding to the next task." -ForegroundColor Yellow
    exit 1
}

Write-Host "ALL CHECKS PASSED" -ForegroundColor Green

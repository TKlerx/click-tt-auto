#!/usr/bin/env pwsh

param(
    [string]$Path = "docs/runtime-credentials.md",
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Normalize-Cell([string]$value) {
    return ($value.Trim() -replace '^`|`$', '').Trim()
}

function Get-MarkdownTableRows([string[]]$Lines, [string]$Heading) {
    $start = -1
    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($Lines[$index].Trim() -eq "## $Heading") {
            $start = $index + 1
            break
        }
    }

    if ($start -lt 0) {
        return @()
    }

    $rows = [System.Collections.Generic.List[object]]::new()
    for ($index = $start; $index -lt $Lines.Count; $index++) {
        $line = $Lines[$index].Trim()
        if ($line.StartsWith("## ")) {
            break
        }

        if (-not $line.StartsWith("|")) {
            continue
        }

        if ($line -match '^\|\s*-+\s*\|') {
            continue
        }

        $cells = @(
            $line.Trim("|").Split("|") | ForEach-Object { Normalize-Cell $_ }
        )
        if ($cells.Count -gt 0 -and $cells[0] -notin @("Setting", "Runtime", "ID")) {
            $rows.Add([pscustomobject]@{ Cells = $cells }) | Out-Null
        }
    }

    return @($rows)
}

function Test-RuntimeCredentialDocument([string]$DocumentPath) {
    if (-not (Test-Path $DocumentPath -PathType Leaf)) {
        return @("Runtime credential document not found: $DocumentPath")
    }

    $lines = @(Get-Content $DocumentPath)
    $errors = @()
    $exceptionIds = @{}

    $exceptionRows = Get-MarkdownTableRows $lines "Exceptions"
    foreach ($row in $exceptionRows) {
        $cells = $row.Cells
        if ($cells.Count -lt 7) {
            $errors += "Exception row must have 7 columns: $($cells -join ' | ')"
            continue
        }

        $id, $settings, $owner, $rationale, $control, $reviewDate, $status = $cells[0..6]
        if (-not $id -or -not $settings -or -not $owner -or -not $rationale -or -not $control -or -not $reviewDate -or -not $status) {
            $errors += "Exception $id must include settings, owner, rationale, compensating control, review date, and status."
            continue
        }

        try {
            $parsedReviewDate = [DateTime]::Parse($reviewDate).Date
            if ($parsedReviewDate -lt (Get-Date).Date) {
                $errors += "Exception $id review date has expired: $reviewDate"
            }
        } catch {
            $errors += "Exception $id review date is invalid: $reviewDate"
        }

        if ($status -notin @("accepted", "proposed")) {
            $errors += "Exception $id status must be accepted or proposed."
        }

        $exceptionIds[$id] = $true
    }

    $inventoryRows = Get-MarkdownTableRows $lines "Credential Inventory"
    if ($inventoryRows.Count -eq 0) {
        $errors += "Credential Inventory table is missing or empty."
    }

    foreach ($row in $inventoryRows) {
        $cells = $row.Cells
        if ($cells.Count -lt 5) {
            $errors += "Inventory row must have 5 columns: $($cells -join ' | ')"
            continue
        }

        $setting, $owner, $purpose, $requiredIn, $exception = $cells[0..4]
        if (-not $setting -or -not $owner -or -not $purpose -or -not $requiredIn) {
            $errors += "Inventory row for '$setting' must include setting, owner, purpose, and required-in fields."
        }

        if ($owner -eq "shared-exception" -and -not $exception) {
            $errors += "Shared credential '$setting' must reference a documented exception."
        }

        if ($exception -and -not $exceptionIds.ContainsKey($exception)) {
            $errors += "Credential '$setting' references unknown exception '$exception'."
        }
    }

    $forbiddenAppSettings = @(
        "MIGRATION_DATABASE_URL",
        "GRAPH_CLIENT_ID",
        "GRAPH_CLIENT_SECRET",
        "GRAPH_TENANT_ID",
        "MAIL_DEFAULT_MAILBOX"
    )
    $exposureRows = Get-MarkdownTableRows $lines "Runtime Exposures"
    foreach ($row in $exposureRows) {
        $cells = $row.Cells
        if ($cells.Count -lt 3) {
            $errors += "Runtime exposure row must have 3 columns: $($cells -join ' | ')"
            continue
        }

        $runtime, $setting, $exception = $cells[0..2]
        if (-not $runtime -or -not $setting) {
            $errors += "Runtime exposure row must include runtime and setting."
            continue
        }

        if ($exception -and -not $exceptionIds.ContainsKey($exception)) {
            $errors += "Runtime exposure '$runtime/$setting' references unknown exception '$exception'."
        }

        if ($runtime -eq "app" -and $forbiddenAppSettings.Contains($setting) -and -not $exception) {
            $errors += "App runtime must not receive '$setting' without a documented exception."
        }
    }

    return $errors
}

function Invoke-OneValidation([string]$DocumentPath, [bool]$ShouldPass) {
    $errors = @(Test-RuntimeCredentialDocument $DocumentPath)
    $passed = $errors.Count -eq 0
    if ($passed -ne $ShouldPass) {
        if ($passed) {
            throw "Expected validation to fail for $DocumentPath, but it passed."
        }

        throw "Expected validation to pass for $DocumentPath, but it failed: $($errors -join '; ')"
    }
}

if ($SelfTest) {
    Invoke-OneValidation "scripts/testdata/runtime-credentials/valid.md" $true
    Invoke-OneValidation "scripts/testdata/runtime-credentials/shared-graph-exception.md" $true
    Invoke-OneValidation "scripts/testdata/runtime-credentials/missing-owner.md" $false
    Invoke-OneValidation "scripts/testdata/runtime-credentials/app-has-migration-url.md" $false
    Invoke-OneValidation "scripts/testdata/runtime-credentials/app-has-worker-graph-secret.md" $false
    Invoke-OneValidation "scripts/testdata/runtime-credentials/shared-without-exception.md" $false
    Invoke-OneValidation "scripts/testdata/runtime-credentials/expired-exception.md" $false
}

$documentErrors = @(Test-RuntimeCredentialDocument $Path)
if ($documentErrors.Count -gt 0) {
    $documentErrors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "Runtime credential validation passed."

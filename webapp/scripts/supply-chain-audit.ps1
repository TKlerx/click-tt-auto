#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Runs supply-chain audits for deployable template artifacts.

.DESCRIPTION
    Builds and scans the app, migration, and worker runtime images with Trivy,
    scans Azure OpenTofu and Docker/Compose configuration with Trivy config,
    and runs production dependency audits in host/image contexts. High and
    Critical findings block unless a narrow active exception matches finding id,
    artifact, and package.

    The Trivy scanner itself runs from a repo-pinned digest image and must be
    older than the 7-day cooldown window unless an emergency override is used.
#>

param(
    [ValidateSet("all", "app", "migrate", "worker", "infra")]
    [string]$Artifact = "all",

    [string]$AppImage = "business-app-starter:latest",
    [string]$MigrateImage = "business-app-starter-migrate:latest",
    [string]$WorkerImage = "business-app-starter-worker:latest",
    [string]$TrivyImage = "",
    [string]$TrivyImageReleasedAt = "",
    [string]$ReportPath = ".artifacts/supply-chain-audit/report.json",
    [string]$ExceptionFile = "supply-chain-audit-exceptions.json",

    [switch]$SkipBuild,
    [switch]$SkipImageScans,
    [switch]$SkipConfigScans,
    [switch]$SkipDependencyAudits,
    [switch]$AllowTrivyCooldownOverride
)

$ErrorActionPreference = "Stop"
$BlockingSeverities = @("HIGH", "CRITICAL")
$Now = [DateTimeOffset]::UtcNow
$TrivyCooldown = [TimeSpan]::FromDays(7)
$DefaultTrivyImage = "aquasec/trivy:0.71.0@sha256:016eae51fdcf989332a5404af7e8f625cd5d95d7c0907a221d080a996f556500"
$DefaultTrivyImageReleasedAt = [DateTimeOffset]::Parse("2026-06-01T00:00:00Z", [System.Globalization.CultureInfo]::InvariantCulture)
$ReportResults = @()
$ExceptionRecords = @()
$InvalidExceptions = @()
$ResolvedTrivyImage = $null

function Write-Step([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Write-ResultLine([object]$Result) {
    $color = switch ($Result.status) {
        "pass" { "Green" }
        "fail" { "Red" }
        default { "Yellow" }
    }
    Write-Host ("  [{0}] {1}/{2} findings={3} blocking={4}" -f `
            $Result.status.ToUpperInvariant(), $Result.artifact, $Result.source, `
            @($Result.findings).Count, @($Result.blocking_findings).Count) -ForegroundColor $color
}

function Invoke-CapturedCommand([string]$CommandLine, [string]$WorkingDirectory = $null) {
    $previousLocation = Get-Location
    if ($WorkingDirectory) {
        Set-Location $WorkingDirectory
    }

    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $script:ErrorActionPreference = "Continue"
        try {
            if ($IsWindows -or $env:OS -eq "Windows_NT") {
                $output = cmd /c $CommandLine 2>&1
            } else {
                $output = /bin/sh -lc $CommandLine 2>&1
            }
        } finally {
            $script:ErrorActionPreference = $previousErrorActionPreference
        }

        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output = @($output)
            Text = (@($output) -join "`n").Trim()
        }
    } finally {
        if ($WorkingDirectory) {
            Set-Location $previousLocation
        }
    }
}

function ConvertFrom-TrivyJsonOutput([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $trimmed = $Text.Trim()
    try {
        return $trimmed | ConvertFrom-Json
    } catch {
        $start = $trimmed.IndexOf("{")
        $end = $trimmed.LastIndexOf("}")
        if ($start -lt 0 -or $end -le $start) {
            return $null
        }

        try {
            return $trimmed.Substring($start, $end - $start + 1) | ConvertFrom-Json
        } catch {
            return $null
        }
    }
}

function Get-RepoRoot {
    $root = (& git rev-parse --show-toplevel).Trim()
    if (-not $root) {
        throw "Could not resolve git repository root."
    }
    return $root
}

function Resolve-RepoPath([string]$Path) {
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return Join-Path $script:RepoRoot $Path
}

function ConvertTo-RepoRelativePath([string]$Path) {
    $resolved = Resolve-RepoPath $Path
    return [System.IO.Path]::GetRelativePath($script:RepoRoot, $resolved).Replace("\", "/")
}

function ConvertTo-JsonDepth([object]$Value) {
    return $Value | ConvertTo-Json -Depth 16
}

function Read-JsonFile([string]$Path) {
    $resolved = Resolve-RepoPath $Path
    if (-not (Test-Path $resolved -PathType Leaf)) {
        throw "Required file is missing: $(ConvertTo-RepoRelativePath $resolved)"
    }

    $raw = Get-Content -Path $resolved -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "JSON file is empty: $(ConvertTo-RepoRelativePath $resolved)"
    }

    return $raw | ConvertFrom-Json
}

function Test-RequiredFile([string]$Path, [string]$ArtifactName, [string]$SourceName) {
    $resolved = Resolve-RepoPath $Path
    if (Test-Path $resolved -PathType Leaf) {
        return $true
    }

    Add-InconclusiveResult `
        -ArtifactName $ArtifactName `
        -SourceName $SourceName `
        -Command "metadata check" `
        -Message "Required metadata file is missing: $(ConvertTo-RepoRelativePath $resolved)"
    return $false
}

function Get-DateValue([object]$Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }

    try {
        return [DateTimeOffset]::Parse([string]$Value)
    } catch {
        return $null
    }
}

function Add-InvalidException([string]$Id, [string]$Reason) {
    $script:InvalidExceptions += [pscustomobject]@{
        id = if ([string]::IsNullOrWhiteSpace($Id)) { "<missing>" } else { $Id }
        reason = $Reason
    }
}

function Read-AuditExceptions {
    $data = Read-JsonFile $ExceptionFile
    $records = @()

    if ($data -is [array]) {
        $records = @($data)
    } elseif ($data.PSObject.Properties.Name -contains "exceptions") {
        $records = @($data.exceptions)
    } else {
        Add-InvalidException "<root>" "Exception file must be an array or an object with an exceptions array."
        return @()
    }

    $validatedRecords = @()
    foreach ($record in $records) {
        $id = [string]$record.id
        $requiredTextFields = @("id", "finding_id", "artifact", "package_name", "owner", "reason", "approved_at", "review_by", "status")
        foreach ($field in $requiredTextFields) {
            if ([string]::IsNullOrWhiteSpace([string]$record.$field)) {
                Add-InvalidException $id "Missing required field: $field."
            }
        }

        if ([string]$record.finding_id -in @("*", "ALL", "HIGH", "CRITICAL") -or
            [string]$record.artifact -in @("*", "all") -or
            [string]$record.package_name -in @("*", "all")) {
            Add-InvalidException $id "Broad exception scope is not allowed."
        }

        if ([string]$record.status -notin @("active", "expired", "revoked")) {
            Add-InvalidException $id "status must be active, expired, or revoked."
        }

        $approvedAt = Get-DateValue $record.approved_at
        $reviewBy = Get-DateValue $record.review_by
        $expiresAt = Get-DateValue $record.expires_at

        if ($null -eq $approvedAt) {
            Add-InvalidException $id "approved_at must be a valid date."
        }
        if ($null -eq $reviewBy) {
            Add-InvalidException $id "review_by must be a valid date."
        }
        if ($approvedAt -and $reviewBy -and $reviewBy -gt $approvedAt.AddDays(30)) {
            Add-InvalidException $id "review_by must be no later than 30 days after approved_at."
        }
        if ($reviewBy -and $reviewBy.Date -lt $Now.Date) {
            Add-InvalidException $id "review_by is in the past."
        }
        if ($expiresAt -and $expiresAt.Date -lt $Now.Date) {
            Add-InvalidException $id "expires_at is in the past."
        }

        $validatedRecords += $record
    }

    return @($validatedRecords)
}

function Find-ActiveException([object]$Finding) {
    foreach ($exception in $ExceptionRecords) {
        if ([string]$exception.status -ne "active") {
            continue
        }

        $approvedAt = Get-DateValue $exception.approved_at
        $reviewBy = Get-DateValue $exception.review_by
        $expiresAt = Get-DateValue $exception.expires_at
        if ($null -eq $approvedAt -or $null -eq $reviewBy) {
            continue
        }
        if ($reviewBy -gt $approvedAt.AddDays(30) -or $reviewBy.Date -lt $Now.Date) {
            continue
        }
        if ($expiresAt -and $expiresAt.Date -lt $Now.Date) {
            continue
        }

        if ([string]$exception.finding_id -eq [string]$Finding.id -and
            [string]$exception.artifact -eq [string]$Finding.artifact -and
            [string]$exception.package_name -eq [string]$Finding.package_name) {
            return $exception
        }
    }

    return $null
}

function Resolve-TrivyImage {
    if ($script:ResolvedTrivyImage) {
        return $script:ResolvedTrivyImage
    }

    $imageReference = $TrivyImage
    if (-not $imageReference) {
        $imageReference = $env:WEBAPP_TEMPLATE_TRIVY_IMAGE
    }
    if (-not $imageReference) {
        $imageReference = $DefaultTrivyImage
    }

    if ($imageReference -notmatch "@sha256:[a-fA-F0-9]{64}$") {
        throw "Trivy scanner image must be pinned by digest. Use -TrivyImage or WEBAPP_TEMPLATE_TRIVY_IMAGE with a reference like aquasec/trivy:0.71.0@sha256:..."
    }

    $releasedAt = $DefaultTrivyImageReleasedAt
    if ($imageReference -ne $DefaultTrivyImage) {
        $releasedAtText = $TrivyImageReleasedAt
        if (-not $releasedAtText) {
            $releasedAtText = $env:WEBAPP_TEMPLATE_TRIVY_IMAGE_RELEASED_AT
        }
        if (-not $releasedAtText) {
            throw "Custom Trivy scanner images require -TrivyImageReleasedAt or WEBAPP_TEMPLATE_TRIVY_IMAGE_RELEASED_AT so the 7-day cooldown can be enforced."
        }
        try {
            $releasedAt = [DateTimeOffset]::Parse($releasedAtText, [System.Globalization.CultureInfo]::InvariantCulture)
        } catch {
            throw "Trivy scanner image release timestamp must be an ISO-8601 date/time, for example 2026-06-01T00:00:00Z."
        }
    }

    $overrideCooldown = $AllowTrivyCooldownOverride -or $env:WEBAPP_TEMPLATE_ALLOW_TRIVY_COOLDOWN_OVERRIDE -eq "1"
    if (($Now - $releasedAt) -lt $TrivyCooldown -and -not $overrideCooldown) {
        throw "Trivy scanner image is inside the 7-day cooldown window. Use an older pinned digest, or set -AllowTrivyCooldownOverride only for an approved emergency."
    }

    $script:ResolvedTrivyImage = $imageReference
    return $script:ResolvedTrivyImage
}

function New-Finding(
    [string]$Id,
    [string]$ArtifactName,
    [string]$SourceName,
    [string]$PackageName,
    [string]$InstalledVersion,
    [string]$Severity,
    [string]$FixedVersion
) {
    $normalizedSeverity = if ([string]::IsNullOrWhiteSpace($Severity)) { "UNKNOWN" } else { $Severity.ToUpperInvariant() }
    $finding = [pscustomobject]@{
        id = if ([string]::IsNullOrWhiteSpace($Id)) { "UNKNOWN" } else { $Id }
        artifact = $ArtifactName
        source = $SourceName
        package_name = if ([string]::IsNullOrWhiteSpace($PackageName)) { "unknown" } else { $PackageName }
        installed_version = if ([string]::IsNullOrWhiteSpace($InstalledVersion)) { "unknown" } else { $InstalledVersion }
        severity = $normalizedSeverity
        fixed_version = if ([string]::IsNullOrWhiteSpace($FixedVersion)) { $null } else { $FixedVersion }
        exception_id = $null
        blocking = $false
    }

    if ($BlockingSeverities -contains $normalizedSeverity) {
        $exception = Find-ActiveException $finding
        if ($exception) {
            $finding.exception_id = [string]$exception.id
        } else {
            $finding.blocking = $true
        }
    }

    return $finding
}

function Add-AuditResult(
    [string]$ArtifactName,
    [string]$SourceName,
    [string]$Command,
    [string]$Scanner,
    [string]$Status,
    [object[]]$Findings,
    [object]$Metadata = $null
) {
    $blocking = @($Findings | Where-Object { $_.blocking })
    if ($Status -eq "pass" -and $blocking.Count -gt 0) {
        $Status = "fail"
    }

    $result = [pscustomobject]@{
        artifact = $ArtifactName
        source = $SourceName
        command = $Command
        scanner = $Scanner
        status = $Status
        findings = @($Findings)
        blocking_findings = @($blocking)
        metadata = $Metadata
    }

    $script:ReportResults += $result
    Write-ResultLine $result
}

function Add-InconclusiveResult([string]$ArtifactName, [string]$SourceName, [string]$Command, [string]$Message) {
    Add-AuditResult `
        -ArtifactName $ArtifactName `
        -SourceName $SourceName `
        -Command $Command `
        -Scanner "validation-wrapper" `
        -Status "inconclusive" `
        -Findings @() `
        -Metadata ([pscustomobject]@{ message = $Message })
}

function Get-SelectedArtifacts {
    if ($Artifact -eq "all") {
        return @("app", "migrate", "worker")
    }
    if ($Artifact -eq "infra") {
        return @()
    }
    return @($Artifact)
}

function Get-ImageReference([string]$ArtifactName) {
    switch ($ArtifactName) {
        "app" { return $AppImage }
        "migrate" { return $MigrateImage }
        "worker" { return $WorkerImage }
        default { throw "Unknown artifact: $ArtifactName" }
    }
}

function Build-Image([string]$ArtifactName, [string]$ImageReference) {
    $command = switch ($ArtifactName) {
        "app" { "docker build --pull --no-cache --target runner -t `"$ImageReference`" -f Dockerfile.app ." }
        "migrate" { "docker build --pull --no-cache --target migrate-runner -t `"$ImageReference`" -f Dockerfile.app ." }
        "worker" { "docker build --pull --no-cache -t `"$ImageReference`" -f webapp/Dockerfile.worker .." }
        default { throw "Unknown artifact: $ArtifactName" }
    }

    Write-Step "Build $ArtifactName runtime image"
    $result = Invoke-CapturedCommand $command $RepoRoot
    if ($result.ExitCode -ne 0) {
        Add-InconclusiveResult $ArtifactName "runtime-image-scan" $command "Image build failed: $($result.Text)"
        return $false
    }

    Write-Host "  [OK] built $ImageReference" -ForegroundColor Green
    return $true
}

function Build-AuditImage([string]$ArtifactName, [string]$ImageReference) {
    $command = switch ($ArtifactName) {
        "app" { "docker build --target dependency-audit -t `"$ImageReference`" -f Dockerfile.app ." }
        "worker" { "docker build --target dependency-audit -t `"$ImageReference`" -f webapp/Dockerfile.worker .." }
        default { throw "Dependency audit image is not defined for artifact: $ArtifactName" }
    }

    $result = Invoke-CapturedCommand $command $RepoRoot
    if ($result.ExitCode -ne 0) {
        Add-InconclusiveResult $ArtifactName "$ArtifactName-image-dependency-audit" $command "Audit image build failed: $($result.Text)"
        return $false
    }

    return $true
}

function ConvertFrom-PnpmAudit([object]$Audit, [string]$ArtifactName, [string]$SourceName) {
    $findings = @()
    if (-not $Audit) {
        return @()
    }

    if ($Audit.vulnerabilities) {
        foreach ($property in $Audit.vulnerabilities.PSObject.Properties) {
            $packageName = $property.Name
            $vulnerability = $property.Value
            $severity = [string]$vulnerability.severity
            $installed = if ($vulnerability.range) { [string]$vulnerability.range } else { "unknown" }
            $fixedVersion = $null
            if ($vulnerability.fixAvailable -and $vulnerability.fixAvailable -isnot [bool]) {
                $fixedVersion = [string]$vulnerability.fixAvailable.version
            }

            foreach ($via in @($vulnerability.via)) {
                if ($via -is [string]) {
                    continue
                }

                $id = if ($via.source) { [string]$via.source } elseif ($via.url) { [string]$via.url } else { "$packageName-advisory" }
                $findingSeverity = if ($via.severity) { [string]$via.severity } else { $severity }
                $findings += New-Finding `
                    -Id $id `
                    -ArtifactName $ArtifactName `
                    -SourceName $SourceName `
                    -PackageName $packageName `
                    -InstalledVersion $installed `
                    -Severity $findingSeverity `
                    -FixedVersion $fixedVersion
            }
        }
    }

    if ($Audit.advisories) {
        foreach ($property in $Audit.advisories.PSObject.Properties) {
            $advisory = $property.Value
            $packageName = if ($advisory.module_name) { [string]$advisory.module_name } else { $property.Name }
            $id = if ($advisory.github_advisory_id) { [string]$advisory.github_advisory_id } elseif ($advisory.id) { [string]$advisory.id } else { "$packageName-advisory" }
            $installedVersions = @($advisory.findings | ForEach-Object { [string]$_.version } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
            $installed = if ($installedVersions.Count -gt 0) { $installedVersions -join ", " } else { "unknown" }
            $findings += New-Finding `
                -Id $id `
                -ArtifactName $ArtifactName `
                -SourceName $SourceName `
                -PackageName $packageName `
                -InstalledVersion $installed `
                -Severity ([string]$advisory.severity) `
                -FixedVersion ([string]$advisory.patched_versions)
        }
    }

    return @($findings)
}

function Invoke-HostAppAudit {
    if (-not (Test-RequiredFile "package.json" "app" "app-host-dependency-audit")) { return }
    if (-not (Test-RequiredFile "pnpm-lock.yaml" "app" "app-host-dependency-audit")) { return }

    Write-Step "App host production dependency audit"
    $command = "pnpm audit --prod --no-optional --json"
    $result = Invoke-CapturedCommand $command $RepoRoot
    $audit = $null
    if ($result.Text) {
        $audit = ConvertFrom-TrivyJsonOutput $result.Text
    }

    if (-not $audit) {
        Add-InconclusiveResult "app" "app-host-dependency-audit" $command "pnpm audit did not produce parseable JSON."
        return
    }

    $findings = @(ConvertFrom-PnpmAudit $audit "app" "app-host-dependency-audit")
    $status = if (@($findings | Where-Object { $_.blocking }).Count -gt 0) { "fail" } else { "pass" }
    Add-AuditResult "app" "app-host-dependency-audit" $command "pnpm" $status $findings $audit.metadata
}

function Invoke-AppImageDependencyAudit {
    if (-not (Test-RequiredFile "package.json" "app" "app-image-dependency-audit")) { return }
    if (-not (Test-RequiredFile "pnpm-lock.yaml" "app" "app-image-dependency-audit")) { return }

    Write-Step "App image-context production dependency audit"
    $auditImage = "business-app-starter-dependency-audit:latest"
    if (-not (Build-AuditImage "app" $auditImage)) { return }

    $command = "docker run --rm `"$auditImage`""
    $result = Invoke-CapturedCommand $command $RepoRoot
    $audit = $null
    if ($result.Text) {
        $audit = ConvertFrom-TrivyJsonOutput $result.Text
    }

    if (-not $audit) {
        Add-InconclusiveResult "app" "app-image-dependency-audit" $command "Image-context pnpm audit did not produce parseable JSON."
        return
    }

    $findings = @(ConvertFrom-PnpmAudit $audit "app" "app-image-dependency-audit")
    $status = if (@($findings | Where-Object { $_.blocking }).Count -gt 0) { "fail" } else { "pass" }
    Add-AuditResult "app" "app-image-dependency-audit" $command "pnpm" $status $findings $audit.metadata
}

function ConvertFrom-UvAuditText([string]$Text, [string]$ArtifactName, [string]$SourceName) {
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    if ($Text -match '(?i)no vulnerabilities|audited .* no known vulnerabilities|found 0') {
        return @()
    }

    $findings = @()
    $ids = [regex]::Matches($Text, '(CVE-\d{4}-\d+|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|PYSEC-\d{4}-\d+)') |
        ForEach-Object { $_.Value } |
        Sort-Object -Unique

    foreach ($id in $ids) {
        $findings += New-Finding `
            -Id $id `
            -ArtifactName $ArtifactName `
            -SourceName $SourceName `
            -PackageName "unknown" `
            -InstalledVersion "unknown" `
            -Severity "HIGH" `
            -FixedVersion $null
    }

    if ($findings.Count -eq 0) {
        $findings += New-Finding `
            -Id "uv-audit-finding" `
            -ArtifactName $ArtifactName `
            -SourceName $SourceName `
            -PackageName "unknown" `
            -InstalledVersion "unknown" `
            -Severity "HIGH" `
            -FixedVersion $null
    }

    return @($findings)
}

function Invoke-WorkerImageDependencyAudit {
    if (-not (Test-RequiredFile "worker/pyproject.toml" "worker" "worker-image-dependency-audit")) { return }
    if (-not (Test-RequiredFile "worker/uv.lock" "worker" "worker-image-dependency-audit")) { return }

    Write-Step "Worker image-context production dependency audit"
    $auditImage = "business-app-starter-worker-dependency-audit:latest"
    if (-not (Build-AuditImage "worker" $auditImage)) { return }

    $command = "docker run --rm `"$auditImage`""
    $result = Invoke-CapturedCommand $command $RepoRoot
    if ($result.ExitCode -eq 0) {
        Add-AuditResult "worker" "worker-image-dependency-audit" "uv audit --frozen --no-dev" "uv" "pass" @() ([pscustomobject]@{ output = $result.Text })
        return
    }

    $findings = @(ConvertFrom-UvAuditText $result.Text "worker" "worker-image-dependency-audit")
    $status = if ($findings.Count -gt 0) { "fail" } else { "inconclusive" }
    Add-AuditResult "worker" "worker-image-dependency-audit" "uv audit --frozen --no-dev" "uv" $status $findings ([pscustomobject]@{ output = $result.Text })
}

function Invoke-SelectedDependencyAudits {
    if ($Artifact -in @("all", "app")) {
        Invoke-HostAppAudit
        Invoke-AppImageDependencyAudit
    }
    if ($Artifact -in @("all", "worker")) {
        Invoke-WorkerImageDependencyAudit
    }
}

function ConvertFrom-TrivyResult([object]$Trivy, [string]$ArtifactName, [string]$SourceName) {
    $findings = @()
    foreach ($result in @($Trivy.Results)) {
        foreach ($vulnerability in @($result.Vulnerabilities | Where-Object { $null -ne $_ })) {
            $findings += New-Finding `
                -Id ([string]$vulnerability.VulnerabilityID) `
                -ArtifactName $ArtifactName `
                -SourceName $SourceName `
                -PackageName ([string]$vulnerability.PkgName) `
                -InstalledVersion ([string]$vulnerability.InstalledVersion) `
                -Severity ([string]$vulnerability.Severity) `
                -FixedVersion ([string]$vulnerability.FixedVersion)
        }
    }
    return @($findings)
}

function ConvertFrom-TrivyConfigResult([object]$Trivy, [string]$ArtifactName, [string]$SourceName) {
    $findings = @()
    foreach ($result in @($Trivy.Results)) {
        $target = if ([string]::IsNullOrWhiteSpace([string]$result.Target)) { "configuration" } else { [string]$result.Target }
        foreach ($misconfiguration in @($result.Misconfigurations | Where-Object { $null -ne $_ })) {
            $title = if ([string]::IsNullOrWhiteSpace([string]$misconfiguration.Title)) {
                [string]$misconfiguration.Message
            } else {
                [string]$misconfiguration.Title
            }
            $packageName = if ([string]::IsNullOrWhiteSpace($title)) { $target } else { "$target`: $title" }
            $findings += New-Finding `
                -Id ([string]$misconfiguration.ID) `
                -ArtifactName $ArtifactName `
                -SourceName $SourceName `
                -PackageName $packageName `
                -InstalledVersion "configuration" `
                -Severity ([string]$misconfiguration.Severity) `
                -FixedVersion $null
        }
    }
    return @($findings)
}

function Get-TrivyImageCommand([string]$ImageReference) {
    $scannerImage = Resolve-TrivyImage
    return "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy_cache:/root/.cache `"$scannerImage`" image --quiet --ignore-unfixed --scanners vuln --format json --severity HIGH,CRITICAL `"$ImageReference`""
}

function Get-TrivyConfigCommand([string]$ScanPath) {
    $relativePath = ConvertTo-RepoRelativePath $ScanPath
    $containerPath = "/repo/$relativePath".Replace("\", "/")
    $scannerImage = Resolve-TrivyImage
    $skipDirs = "--skip-dirs /repo/infra/azure/.terraform --skip-dirs /repo/infra/azure/bootstrap/.terraform"
    return "docker run --rm -v `"$RepoRoot`":/repo:ro -v trivy_cache:/root/.cache `"$scannerImage`" config --quiet $skipDirs --format json --severity HIGH,CRITICAL `"$containerPath`""
}

function Invoke-TrivyImageScan([string]$ArtifactName, [string]$ImageReference) {
    Write-Step "$ArtifactName runtime image vulnerability scan"
    $command = Get-TrivyImageCommand $ImageReference
    $result = Invoke-CapturedCommand $command $RepoRoot
    if ($result.ExitCode -ne 0) {
        Add-InconclusiveResult $ArtifactName "runtime-image-scan" $command "Trivy image scan failed: $($result.Text)"
        return
    }

    $trivy = $null
    if ($result.Text) {
        $trivy = ConvertFrom-TrivyJsonOutput $result.Text
    }
    if (-not $trivy) {
        Add-InconclusiveResult $ArtifactName "runtime-image-scan" $command "Trivy did not produce parseable JSON."
        return
    }

    $findings = @(ConvertFrom-TrivyResult $trivy $ArtifactName "runtime-image-scan")
    $status = if (@($findings | Where-Object { $_.blocking }).Count -gt 0) { "fail" } else { "pass" }
    Add-AuditResult $ArtifactName "runtime-image-scan" $command "trivy" $status $findings ([pscustomobject]@{
            image_reference = $ImageReference
            schema_version = $trivy.SchemaVersion
            created_at = $trivy.CreatedAt
            artifact_name = $trivy.ArtifactName
            artifact_type = $trivy.ArtifactType
        })
}

function Invoke-TrivyConfigScan([string]$ArtifactName, [string]$ScanPath) {
    $resolvedScanPath = Resolve-RepoPath $ScanPath
    $sourceName = "config-scan"
    if (-not (Test-Path $resolvedScanPath)) {
        Add-InconclusiveResult $ArtifactName $sourceName "metadata check" "Configuration scan path is missing: $(ConvertTo-RepoRelativePath $resolvedScanPath)"
        return
    }

    Write-Step "$ArtifactName configuration misconfiguration scan"
    $command = Get-TrivyConfigCommand $resolvedScanPath
    $result = Invoke-CapturedCommand $command $RepoRoot
    if ($result.ExitCode -ne 0) {
        Add-InconclusiveResult $ArtifactName $sourceName $command "Trivy config scan failed: $($result.Text)"
        return
    }

    $trivy = $null
    if ($result.Text) {
        $trivy = ConvertFrom-TrivyJsonOutput $result.Text
    }
    if (-not $trivy) {
        Add-InconclusiveResult $ArtifactName $sourceName $command "Trivy config scan did not produce parseable JSON."
        return
    }

    $findings = @(ConvertFrom-TrivyConfigResult $trivy $ArtifactName $sourceName)
    $status = if (@($findings | Where-Object { $_.blocking }).Count -gt 0) { "fail" } else { "pass" }
    Add-AuditResult $ArtifactName $sourceName $command "trivy" $status $findings ([pscustomobject]@{
            scan_path = ConvertTo-RepoRelativePath $resolvedScanPath
            schema_version = $trivy.SchemaVersion
            created_at = $trivy.CreatedAt
            artifact_name = $trivy.ArtifactName
            artifact_type = $trivy.ArtifactType
        })
}

function Invoke-SelectedConfigScans {
    if ($Artifact -in @("all", "infra")) {
        Invoke-TrivyConfigScan "infra" "infra/azure"
    }
    if ($Artifact -in @("all", "app", "migrate")) {
        Invoke-TrivyConfigScan "app" "Dockerfile.app"
    }
    if ($Artifact -in @("all", "worker")) {
        Invoke-TrivyConfigScan "worker" "Dockerfile.worker"
    }
    if ($Artifact -in @("all", "infra")) {
        Invoke-TrivyConfigScan "compose" "docker-compose.yml"
    }
}

$RepoRoot = Get-RepoRoot
$ExceptionRecords = @(Read-AuditExceptions)
if ($InvalidExceptions.Count -gt 0) {
    foreach ($invalid in $InvalidExceptions) {
        Write-Host ("Invalid exception {0}: {1}" -f $invalid.id, $invalid.reason) -ForegroundColor Red
    }
    throw "Supply-chain audit exception file contains invalid records."
}

$selectedArtifacts = @(Get-SelectedArtifacts)

if (-not $SkipConfigScans) {
    Invoke-SelectedConfigScans
}

if (-not $SkipDependencyAudits) {
    Invoke-SelectedDependencyAudits
}

foreach ($selectedArtifact in $selectedArtifacts) {
    $imageReference = Get-ImageReference $selectedArtifact
    $imageReady = $true
    if (-not $SkipBuild) {
        $imageReady = Build-Image $selectedArtifact $imageReference
    }

    if (-not $SkipImageScans -and $imageReady) {
        Invoke-TrivyImageScan $selectedArtifact $imageReference
    }
}

$report = [pscustomobject]@{
    generated_at = $Now.ToString("o")
    policy = [pscustomobject]@{
        blocking_severities = $BlockingSeverities
        inconclusive_blocks = $true
        image_scans_ignore_unfixed = $true
        exception_file = ConvertTo-RepoRelativePath $ExceptionFile
        trivy_image = Resolve-TrivyImage
        trivy_cooldown_days = [int]$TrivyCooldown.TotalDays
    }
    results = @($ReportResults)
}

$resolvedReportPath = Resolve-RepoPath $ReportPath
$reportDirectory = Split-Path -Parent $resolvedReportPath
if ($reportDirectory -and -not (Test-Path $reportDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}
ConvertTo-JsonDepth $report | Set-Content -Path $resolvedReportPath -Encoding utf8NoBOM

$blockingResults = @($ReportResults | Where-Object { $_.status -in @("fail", "inconclusive") })
Write-Step "Supply-chain audit summary"
Write-Host "Report: $(ConvertTo-RepoRelativePath $resolvedReportPath)"
if ($blockingResults.Count -gt 0) {
    foreach ($result in $blockingResults) {
        Write-Host ("  - {0}/{1}: {2}" -f $result.artifact, $result.source, $result.status) -ForegroundColor Yellow
        foreach ($finding in @($result.blocking_findings)) {
            $fix = if ($finding.fixed_version) { $finding.fixed_version } else { "no fixed version reported" }
            Write-Host ("    {0} {1} {2}@{3} fix={4}" -f $finding.severity, $finding.id, $finding.package_name, $finding.installed_version, $fix) -ForegroundColor Yellow
        }
        if ($result.status -eq "inconclusive" -and $result.metadata.message) {
            Write-Host ("    {0}" -f $result.metadata.message) -ForegroundColor Yellow
        }
    }
    exit 1
}

Write-Host "ALL SUPPLY-CHAIN AUDITS PASSED" -ForegroundColor Green

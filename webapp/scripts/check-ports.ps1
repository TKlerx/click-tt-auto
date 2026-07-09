param(
    [switch]$CI
)

$ports = @(3000, 5173)
$ErrorActionPreference = "Stop"

function Get-PortOwners([int]$Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -Property LocalPort, OwningProcess -Unique
}

foreach ($port in $ports) {
    $owners = Get-PortOwners -Port $port
    if (-not $owners) {
        Write-Host "[OK] Port $port is free" -ForegroundColor Green
        continue
    }

    foreach ($owner in $owners) {
        $process = Get-Process -Id $owner.OwningProcess -ErrorAction SilentlyContinue
        $name = if ($process) { $process.ProcessName } else { "unknown" }
        Write-Host "[BLOCKED] Port $port is in use by PID $($owner.OwningProcess) ($name)" -ForegroundColor Yellow

        if ($CI) {
            continue
        }

        $answer = Read-Host "Terminate PID $($owner.OwningProcess)? (y/N)"
        if ($answer -match '^(y|yes)$') {
            Stop-Process -Id $owner.OwningProcess -Force
            Write-Host "[OK] Terminated PID $($owner.OwningProcess)" -ForegroundColor Green
        }
    }
}

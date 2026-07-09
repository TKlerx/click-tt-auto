param(
  [string]$SourceDir = $env:CLI_RELEASES_SOURCE_DIR,
  [string]$TargetDir = $(if ($env:CLI_RELEASES_HOST_DIR) { $env:CLI_RELEASES_HOST_DIR } else { ".\data\cli-releases" })
)

$ErrorActionPreference = "Stop"

if (-not $SourceDir) {
  throw "CLI_RELEASES_SOURCE_DIR or -SourceDir is required."
}
if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
  throw "Source directory does not exist: $SourceDir"
}

$patterns = @(
  "starterctl_*_windows_amd64.zip",
  "starterctl_*_windows_arm64.zip",
  "starterctl_*_linux_amd64.tar.gz",
  "starterctl_*_linux_arm64.tar.gz",
  "starterctl_*_darwin_amd64.tar.gz",
  "starterctl_*_darwin_arm64.tar.gz",
  "checksums.txt"
)

$targetFullPath = [System.IO.Path]::GetFullPath($TargetDir)
$tmpDir = "$targetFullPath.tmp"
if (Test-Path -LiteralPath $tmpDir) {
  Remove-Item -LiteralPath $tmpDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$copied = 0
foreach ($pattern in $patterns) {
  Get-ChildItem -LiteralPath $SourceDir -Filter $pattern -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $tmpDir
    $script:copied += 1
  }
}

if ($copied -eq 0) {
  Remove-Item -LiteralPath $tmpDir -Recurse -Force
  throw "No CLI release artifacts found in $SourceDir"
}

if (Test-Path -LiteralPath $targetFullPath) {
  Remove-Item -LiteralPath $targetFullPath -Recurse -Force
}
$parent = Split-Path -Parent $targetFullPath
if ($parent) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
Move-Item -LiteralPath $tmpDir -Destination $targetFullPath

Write-Host "Installed $copied CLI release artifact(s) into $targetFullPath"

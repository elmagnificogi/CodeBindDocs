# CodeBind Docs debug launcher: compile (optional watch) then start VS Code Extension Development Host.
# Usage:
#   powershell -File scripts/debug.ps1
#   powershell -File scripts/debug.ps1 -Watch
#   npm run debug
#   npm run debug:watch

param(
  [switch]$Watch,
  [switch]$SkipCompile,
  [string]$CodePath = ""
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo "package.json"))) {
  Write-Error "Cannot find package.json. Run from CodeBind Docs repo."
}

if (-not $CodePath) {
  $CodePath = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\Code.exe"
}
if (-not (Test-Path $CodePath)) {
  Write-Error "VS Code not found at: $CodePath`nInstall VS Code or pass -CodePath."
}

Write-Host ""
Write-Host "=== CodeBind Docs Debug ===" -ForegroundColor Cyan
Write-Host "repo: $repo"
Write-Host "code: $CodePath"

Push-Location $repo
try {
  if (-not (Test-Path (Join-Path $repo "node_modules"))) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }

  if (-not $SkipCompile) {
    Write-Host "Compiling..." -ForegroundColor Yellow
    npm run compile
    if ($LASTEXITCODE -ne 0) { throw "npm run compile failed" }
    Write-Host "Compile OK." -ForegroundColor Green
  }

  $watchJob = $null
  if ($Watch) {
    Write-Host "Starting TypeScript watch in background..." -ForegroundColor Yellow
    $watchJob = Start-Job -ScriptBlock {
      param($cwd)
      Set-Location $cwd
      npm run watch
    } -ArgumentList $repo
    Write-Host "Watch job id: $($watchJob.Id) (Receive-Job / Stop-Job to manage)" -ForegroundColor DarkGray
  }
} finally {
  Pop-Location
}

$userData = Join-Path $env:TEMP "cbd-vscode-dev-user-data"
$extDir = Join-Path $env:TEMP "cbd-vscode-dev-extensions"
New-Item -ItemType Directory -Force -Path $userData | Out-Null
New-Item -ItemType Directory -Force -Path $extDir | Out-Null

Write-Host "Launching VS Code Extension Development Host..." -ForegroundColor Yellow
Write-Host "  After code changes: npm run compile (or use -Watch), then Reload Window in VS Code." -ForegroundColor DarkGray

Start-Process -FilePath $CodePath -ArgumentList @(
  "--new-window",
  "--user-data-dir=$userData",
  "--extensions-dir=$extDir",
  "--disable-extensions",
  "--extensionDevelopmentPath=$repo",
  $repo
)

Write-Host "Done. VS Code should open with CodeBind Docs loaded." -ForegroundColor Green
Write-Host ""

if ($Watch -and $watchJob) {
  Write-Host "Press Ctrl+C to stop the watch job and exit this script." -ForegroundColor Yellow
  try {
    Wait-Job $watchJob | Out-Null
  } finally {
    Stop-Job $watchJob -ErrorAction SilentlyContinue
    Remove-Job $watchJob -Force -ErrorAction SilentlyContinue
  }
}

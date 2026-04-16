$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendPort = 5173
$workerPort = 8787
$logDir = Join-Path $repoRoot '.codex-logs'
$frontendLog = Join-Path $logDir 'frontend-live.log'
$workerLog = Join-Path $logDir 'worker-live.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-ListeningProcess {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

function Test-CurrentRepoOwner {
  param($Process)

  if (-not $Process) {
    return $false
  }

  $commandLine = [string]$Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return $false
  }

  $commandLine.ToLowerInvariant().Contains($repoRoot.ToLowerInvariant())
}

function Stop-StalePortOwner {
  param([int]$Port, [string]$Name)

  $process = Get-ListeningProcess -Port $Port
  if (-not $process) {
    return
  }

  if (Test-CurrentRepoOwner -Process $process) {
    Write-Host "$Name already running from current repo on port $Port (PID $($process.ProcessId))."
    return
  }

  Write-Host "Stopping stale $Name on port $Port (PID $($process.ProcessId))."
  Write-Host "Owner: $([string]$process.CommandLine)"
  Stop-Process -Id $process.ProcessId -Force
  Start-Sleep -Milliseconds 500
}

function Ensure-Started {
  param(
    [int]$Port,
    [string]$Command
  )

  $process = Get-ListeningProcess -Port $Port
  if ($process -and (Test-CurrentRepoOwner -Process $process)) {
    return
  }

  Start-Process -FilePath 'powershell' `
    -ArgumentList @('-NoProfile', '-Command', $Command) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden | Out-Null
}

Stop-StalePortOwner -Port $frontendPort -Name 'frontend'
Stop-StalePortOwner -Port $workerPort -Name 'worker'

$frontendCommand = "pnpm dev -- --host 0.0.0.0 *> `"$frontendLog`""
$workerCommand = "pnpm cf:dev *> `"$workerLog`""

Ensure-Started -Port $frontendPort -Command $frontendCommand
Ensure-Started -Port $workerPort -Command $workerCommand

Start-Sleep -Seconds 4

$frontendProcess = Get-ListeningProcess -Port $frontendPort
$workerProcess = Get-ListeningProcess -Port $workerPort

if (-not $frontendProcess -or -not (Test-CurrentRepoOwner -Process $frontendProcess)) {
  throw "Frontend failed to start from current repo."
}

if (-not $workerProcess -or -not (Test-CurrentRepoOwner -Process $workerProcess)) {
  throw "Worker failed to start from current repo."
}

Write-Host "Frontend ready on http://localhost:$frontendPort/"
Write-Host "Worker ready on http://127.0.0.1:$workerPort/"
Write-Host "Frontend owner: $([string]$frontendProcess.CommandLine)"
Write-Host "Worker owner: $([string]$workerProcess.CommandLine)"

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendPort = 5173
$workerPort = 8787
$logDir = Join-Path $repoRoot '.codex-logs'
$frontendLog = Join-Path $logDir 'frontend-live.log'
$frontendErrLog = Join-Path $logDir 'frontend-live.err.log'
$workerLog = Join-Path $logDir 'worker-live.log'
$workerErrLog = Join-Path $logDir 'worker-live.err.log'

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
    [string]$Name,
    [string[]]$ArgumentList,
    [string]$StdOutLog,
    [string]$StdErrLog
  )

  $process = Get-ListeningProcess -Port $Port
  if ($process -and (Test-CurrentRepoOwner -Process $process)) {
    Write-Host "$Name already running from current repo on port $Port (PID $($process.ProcessId))."
    return
  }

  Start-Process -FilePath 'pnpm.cmd' `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdOutLog `
    -RedirectStandardError $StdErrLog | Out-Null
}

function Wait-ForRepoOwner {
  param(
    [int]$Port,
    [string]$Name,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $process = Get-ListeningProcess -Port $Port
    if ($process -and (Test-CurrentRepoOwner -Process $process)) {
      return $process
    }

    Start-Sleep -Milliseconds 500
  }

  throw "$Name failed to start from current repo."
}

Stop-StalePortOwner -Port $frontendPort -Name 'frontend'
Stop-StalePortOwner -Port $workerPort -Name 'worker'

Ensure-Started `
  -Port $frontendPort `
  -Name 'Frontend' `
  -ArgumentList @('dev', '--', '--host', '0.0.0.0') `
  -StdOutLog $frontendLog `
  -StdErrLog $frontendErrLog
Ensure-Started `
  -Port $workerPort `
  -Name 'Worker' `
  -ArgumentList @('cf:dev') `
  -StdOutLog $workerLog `
  -StdErrLog $workerErrLog

$frontendProcess = Wait-ForRepoOwner -Port $frontendPort -Name 'Frontend'
$workerProcess = Wait-ForRepoOwner -Port $workerPort -Name 'Worker'

Write-Host "Frontend ready on http://localhost:$frontendPort/"
Write-Host "Worker ready on http://127.0.0.1:$workerPort/"
Write-Host "Frontend owner: $([string]$frontendProcess.CommandLine)"
Write-Host "Worker owner: $([string]$workerProcess.CommandLine)"

param(
  [Parameter(Mandatory = $true)][int]$LauncherPid,
  [Parameter(Mandatory = $true)][int]$ChildPid,
  [string]$Output = "data/production_runtime/external_process_watcher.jsonl"
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodePath = Join-Path $env:LOCALAPPDATA "DecibelTools\node-v22.23.2-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) { throw "Pinned Node 22 executable not found." }
$arguments = @(
  "--import", "tsx",
  "src/run_decibel_external_process_watcher_v1.ts",
  "--launcher-pid", [string]$LauncherPid,
  "--child-pid", [string]$ChildPid,
  "--output", $Output
)
$watcher = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
[pscustomobject]@{
  watcherPid = $watcher.Id
  launcherPid = $LauncherPid
  childPid = $ChildPid
  independentFromProductionLauncher = $true
  autoRestart = $false
} | ConvertTo-Json -Compress

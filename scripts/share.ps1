<#
.SYNOPSIS
  Put this machine's instance on a public URL, for a demo on another device.

.DESCRIPTION
  Three processes, started detached so they outlive the terminal and the editor
  that launched them:

    1. uvicorn          the API, on 127.0.0.1:8000
    2. serve-public.mjs the built web app, with /api piped to the API, on :8080
    3. cloudflared      a quick tunnel from a public https URL to :8080

  One origin rather than two, because the app fetches /api relative and ships
  `connect-src 'self'`: an app and an API on different hostnames would be
  refused by the app's own content policy.

  The URL lives as long as the tunnel process and this machine stay up. It is
  new every run, and it is unauthenticated — anyone holding it can use it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\share.ps1
  powershell -ExecutionPolicy Bypass -File scripts\share.ps1 -Stop
#>
param(
  [switch]$Stop,
  [int]$Port = 8080,
  [int]$ApiPort = 8000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $env:LOCALAPPDATA 'sahayak-share'
$PidFile = Join-Path $LogDir 'pids.json'
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Stop-Share {
  if (-not (Test-Path $PidFile)) { Write-Host 'Nothing recorded as running.'; return }
  $pids = Get-Content $PidFile -Raw | ConvertFrom-Json
  foreach ($entry in $pids.PSObject.Properties) {
    $proc = Get-Process -Id $entry.Value -ErrorAction SilentlyContinue
    if ($proc) { Stop-Process -Id $entry.Value -Force; Write-Host "stopped $($entry.Name) (pid $($entry.Value))" }
  }
  Remove-Item $PidFile -Force
  Write-Host 'The public URL is now dead.'
}

if ($Stop) { Stop-Share; return }

function Test-Listening([int]$P) {
  $null -ne (Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
}

$started = @{}

# -- the built app -----------------------------------------------------------
if (-not (Test-Path (Join-Path $Root 'frontend\dist\index.html'))) {
  Write-Host '== building the web app' -ForegroundColor Cyan
  Push-Location (Join-Path $Root 'frontend'); & npm run build; Pop-Location
  if ($LASTEXITCODE -ne 0) { throw 'the build failed' }
}

# -- the API -----------------------------------------------------------------
if (Test-Listening $ApiPort) {
  Write-Host "== API already listening on $ApiPort" -ForegroundColor Cyan
} else {
  Write-Host "== starting the API on $ApiPort" -ForegroundColor Cyan
  $py = Join-Path $Root 'backend\.venv\Scripts\python.exe'
  $p = Start-Process -FilePath $py `
    -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$ApiPort",'--no-proxy-headers' `
    -WorkingDirectory (Join-Path $Root 'backend') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput "$LogDir\backend.out.log" -RedirectStandardError "$LogDir\backend.err.log"
  $started['backend'] = $p.Id
}

$healthy = $false
foreach ($i in 1..25) {
  try { Invoke-RestMethod "http://127.0.0.1:$ApiPort/api/v1/health" -TimeoutSec 3 | Out-Null; $healthy = $true; break }
  catch { Start-Sleep -Milliseconds 700 }
}
if (-not $healthy) { throw "the API never answered on $ApiPort; see $LogDir\backend.err.log" }

# -- one origin over both ----------------------------------------------------
Write-Host "== serving app + /api on $Port" -ForegroundColor Cyan
$edge = Start-Process -FilePath 'node' -ArgumentList 'scripts/serve-public.mjs','--port',"$Port",'--api',"http://127.0.0.1:$ApiPort" `
  -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$LogDir\edge.out.log" -RedirectStandardError "$LogDir\edge.err.log"
$started['edge'] = $edge.Id
Start-Sleep -Milliseconds 900

# -- the public URL ----------------------------------------------------------
# --protocol http2 rather than the QUIC default: a quick tunnel registered over
# QUIC has been seen to come up with a hostname that never gets a DNS record,
# which looks like a dead link rather than like a failure.
Write-Host '== opening the tunnel' -ForegroundColor Cyan
$errLog = Join-Path $LogDir 'tunnel.err.log'
if (Test-Path $errLog) { Remove-Item $errLog -Force }
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) { throw 'cloudflared is not on PATH' }
$tunnel = Start-Process -FilePath $cf.Source `
  -ArgumentList 'tunnel','--url',"http://127.0.0.1:$Port",'--no-autoupdate','--protocol','http2' `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$LogDir\tunnel.out.log" -RedirectStandardError $errLog
$started['tunnel'] = $tunnel.Id

$url = $null
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  if (Test-Path $errLog) {
    $m = [regex]::Match((Get-Content $errLog -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
  }
}
$started | ConvertTo-Json | Set-Content -Path $PidFile -Encoding utf8
if (-not $url) { throw "the tunnel never printed a URL; see $errLog" }

# The hostname is registered a moment before it resolves. Waiting here means a
# URL this prints is a URL that answers.
foreach ($i in 1..15) {
  try { Resolve-DnsName ([Uri]$url).Host -ErrorAction Stop | Out-Null; break } catch { Start-Sleep -Seconds 4 }
}
$code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 30 "$url/api/v1/health"

Write-Host ''
Write-Host "  $url" -ForegroundColor Green
Write-Host "  API health over it: HTTP $code"
Write-Host ''
Write-Host '  Live from any device on any network, for as long as this machine is'
Write-Host '  awake. Unauthenticated: anyone with the link can use it.'
Write-Host "  Stop it with:  powershell -ExecutionPolicy Bypass -File scripts\share.ps1 -Stop"

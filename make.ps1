<#
.SYNOPSIS
  The Makefile targets, for Windows machines without GNU make.

.EXAMPLE
  .\make.ps1 test
  .\make.ps1 lint
#>
param(
  [Parameter(Position = 0)]
  [string]$Target = 'help'
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Py = Join-Path $Root 'backend\.venv\Scripts\python.exe'

function Invoke-Step {
  param([string]$Name, [scriptblock]$Body)
  Write-Host "== $Name" -ForegroundColor Cyan
  & $Body
  if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)" }
}

function Test-Backend {
  Invoke-Step 'backend tests' { Push-Location "$Root\backend"; & $Py -m pytest; Pop-Location }
}
function Test-Frontend {
  Invoke-Step 'frontend tests' { Push-Location "$Root\frontend"; & npm test; Pop-Location }
}

switch ($Target) {
  'help' {
    Write-Host 'install         install backend and frontend dependencies'
    Write-Host 'dev-backend     run the API on http://127.0.0.1:8000'
    Write-Host 'dev-frontend    run the web app on http://localhost:5173'
    Write-Host 'test            run every test suite, including the schema-drift contract'
    Write-Host 'lint            ruff, eslint, prettier and tsc'
    Write-Host 'schema          regenerate schemas/domain.schema.json from the Pydantic model'
    Write-Host 'ingest          build the source corpus (Phase 11)'
    Write-Host 'ingest-records  load the records layer (Phase 12)'
    Write-Host 'evals           run the evaluation harness (Phase 13)'
  }
  'install' {
    Invoke-Step 'backend deps' {
      & $Py -m pip install fastapi 'uvicorn[standard]' pydantic pydantic-settings pytest httpx ruff
    }
    Invoke-Step 'frontend deps' { Push-Location "$Root\frontend"; & npm install; Pop-Location }
  }
  'dev-backend' {
    Push-Location "$Root\backend"
    & $Py -m uvicorn app.main:app --reload --port 8000
    Pop-Location
  }
  'dev-frontend' {
    Push-Location "$Root\frontend"
    & npm run dev
    Pop-Location
  }
  'test' { Test-Backend; Test-Frontend; Write-Host 'All suites passed.' -ForegroundColor Green }
  'test-backend' { Test-Backend }
  'test-frontend' { Test-Frontend }
  'lint' {
    Invoke-Step 'ruff' { Push-Location "$Root\backend"; & $Py -m ruff check .; Pop-Location }
    Invoke-Step 'eslint' { Push-Location "$Root\frontend"; & npm run lint; Pop-Location }
    Invoke-Step 'prettier' { Push-Location "$Root\frontend"; & npm run format:check; Pop-Location }
    Invoke-Step 'tsc' { Push-Location "$Root\frontend"; & npm run typecheck; Pop-Location }
    Write-Host 'Lint clean.' -ForegroundColor Green
  }
  'format' {
    Push-Location "$Root\backend"; & $Py -m ruff format .; Pop-Location
    Push-Location "$Root\frontend"; & npm run format; Pop-Location
  }
  'schema' { & $Py "$Root\scripts\gen_schema.py" }
  'ingest' {
    Write-Host 'The corpus pipeline arrives in Phase 11. Nothing is ingested yet, and no'
    Write-Host 'index is built. See docs/MASTER_BUILD.md, Phase 11.'
    exit 1
  }
  'ingest-records' {
    Write-Host 'The records layer arrives in Phase 12. See docs/MASTER_BUILD.md, Phase 12.'
    exit 1
  }
  'evals' {
    Write-Host 'The evaluation harness arrives in Phase 13. See docs/MASTER_BUILD.md, Phase 13.'
    exit 1
  }
  default {
    Write-Host "Unknown target '$Target'. Run .\make.ps1 help" -ForegroundColor Red
    exit 1
  }
}

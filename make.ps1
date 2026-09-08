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
    Write-Host '                (set VITE_SAHAYAK_API=mock to run it with no backend)'
    Write-Host 'test            run every test suite, including the schema-drift contract'
    Write-Host 'lint            ruff, eslint, prettier and tsc'
    Write-Host 'schema          regenerate schemas/domain.schema.json from the Pydantic model'
    Write-Host 'i18n            sync every locale with the English key set, then report coverage'
    Write-Host 'manifest        regenerate corpus/manifest.json from the planned source set'
    Write-Host 'ingest          build the index from corpus/manifest.json'
    Write-Host 'ingest-samples  build the index from the fixture documents'
    Write-Host 'refresh         re-fetch and report what has changed since the last ingest'
    Write-Host 'ingest-records  load the records layer (Phase 12)'
    Write-Host 'evals           run the evaluation harness (Phase 13)'
  }
  'install' {
    Invoke-Step 'backend deps' {
      $Backend = Join-Path $Root 'backend'
      & $Py -m pip install -e "$Backend[dev]"
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
  'manifest' {
    & $Py (Join-Path $Root 'scripts\build_manifest.py')
    & $Py (Join-Path $Root 'scripts\build_records_manifest.py')
  }
  'i18n' {
    & node "$Root\scripts\i18n-seed.ts"
    & node "$Root\scripts\i18n-coverage.ts"
  }
  'i18n-check' {
    & node "$Root\scripts\i18n-seed.ts" --check
    & node "$Root\scripts\i18n-coverage.ts"
  }
  'ingest' { & $Py (Join-Path $Root 'scripts\ingest.py') }
  'ingest-samples' {
    & $Py (Join-Path $Root 'scripts\ingest.py') `
      --manifest 'corpus/samples/manifest.json' --index-dir 'data/index-samples'
  }
  'refresh' { & $Py (Join-Path $Root 'scripts\refresh.py') }
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

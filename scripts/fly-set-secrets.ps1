# Push secrets from .env to Fly.io (see scripts/fly-secrets-from-env.mjs).
#
#   .\scripts\fly-set-secrets.ps1           # preview keys (masked)
#   .\scripts\fly-set-secrets.ps1 -Apply    # run fly secrets import
#   .\scripts\fly-set-secrets.ps1 -Apply -App lotus-ledger
#
# Optional: set production URL before apply
#   $env:FLY_APP_URL = "https://lotus-ledger.fly.dev"

param(
    [switch]$Apply,
    [string]$App = "lotus-ledger"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$nodeArgs = @("scripts/fly-secrets-from-env.mjs", "--app", $App)
if ($Apply) {
    $nodeArgs += "--apply"
}

& node @nodeArgs
exit $LASTEXITCODE

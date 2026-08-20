# CaloricoFit — release a VPS
# Requiere Git Bash o WSL

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("staging", "main")]
    [string]$Target,

    [switch]$DeployOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:VPS_APP_SLUG = "caloricofit"

if ($DeployOnly) {
    bash scripts/sync-vps.sh $Target
    exit $LASTEXITCODE
}

bash scripts/release.sh $Target

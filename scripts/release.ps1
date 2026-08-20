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

$GitBash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $GitBash)) { $GitBash = "bash" }

if ($DeployOnly) {
    & $GitBash scripts/sync-vps.sh $Target
    exit $LASTEXITCODE
}

& $GitBash scripts/release.sh $Target

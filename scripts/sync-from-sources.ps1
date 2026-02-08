$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$siteRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Invoke-Git {
  param([Parameter(Mandatory = $true)][string[]]$Args)
  & git -C $siteRoot @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git failed: git -C $siteRoot $($Args -join ' ')"
  }
}

Write-Host "Site root: $siteRoot"
Write-Host 'Single-repo mode is enabled. twi/ and 2ch/ are regular folders in this repository.'
Write-Host 'Current git status:'
Invoke-Git -Args @('status', '--short', '--branch')
Write-Host 'Done.'

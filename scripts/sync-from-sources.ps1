$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-RoboCopy {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string[]]$ExtraArgs = @()
  )

  $argsList = @($Source, $Destination, '/E', '/XD', '.git') + $ExtraArgs
  & robocopy @argsList | Out-Null

  # Robocopy uses bitflag exit codes; <= 7 means success (incl. "files copied").
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed (exit=$LASTEXITCODE): $Source -> $Destination"
  }
}

function Remove-IfExists {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force -Recurse
  }
}

$siteRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$twitterSrc = (Resolve-Path -LiteralPath (Join-Path $siteRoot '..\\twitter-simulator-v2-static')).Path
$chSrc = (Resolve-Path -LiteralPath (Join-Path $siteRoot '..\\2ch-generator')).Path

Write-Host "Site root:   $siteRoot"
Write-Host "Twitter src: $twitterSrc"
Write-Host "2ch src:     $chSrc"

# Rebuild publish outputs (keep: hub/, sw.js customizations).
Remove-IfExists (Join-Path $siteRoot 'assets')
Remove-IfExists (Join-Path $siteRoot 'css')
Remove-IfExists (Join-Path $siteRoot 'js')
Remove-IfExists (Join-Path $siteRoot '2ch')

foreach ($file in @('index.html', 'manifest.webmanifest', 'CNAME', '.gitignore')) {
  $srcPath = Join-Path $twitterSrc $file
  $dstPath = Join-Path $siteRoot $file
  if (Test-Path -LiteralPath $srcPath) {
    Copy-Item -LiteralPath $srcPath -Destination $dstPath -Force
  }
}

Invoke-RoboCopy -Source (Join-Path $twitterSrc 'assets') -Destination (Join-Path $siteRoot 'assets')
Invoke-RoboCopy -Source (Join-Path $twitterSrc 'css') -Destination (Join-Path $siteRoot 'css')
Invoke-RoboCopy -Source (Join-Path $twitterSrc 'js') -Destination (Join-Path $siteRoot 'js')

New-Item -ItemType Directory -Path (Join-Path $siteRoot '2ch') | Out-Null
Invoke-RoboCopy -Source $chSrc -Destination (Join-Path $siteRoot '2ch')

Write-Host "Done."


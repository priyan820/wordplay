<#
  install-voices.ps1 - bake an exported voices zip into the app.

  THIS IS A WORKSHOP TOOL. It never runs on a phone.

  You record words in the app's Voices panel, tap "Export voices (.zip)", and
  send that zip here. This unpacks it into /voice/ and writes voice/manifest.json,
  which is how the recordings reach the other phone and survive a phone wipe.

  Usage:
    powershell -File install-voices.ps1 -Zip "C:\path\wordplay-voices-20260824-1830.zip"
    powershell -File install-voices.ps1 -Zip ... -WhatIf     # list, change nothing

  Re-running with a newer zip overwrites the words it contains and leaves every
  other recording alone, so it is safe to run repeatedly as more get recorded.

  NOTE ON VARIABLE NAMES: PowerShell variables are case-INSENSITIVE, so $Manifest
  and $manifest would collide. Paths therefore carry a *Path suffix.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $Zip,
  [switch] $WhatIf
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Root         = Split-Path -Parent $MyInvocation.MyCommand.Path
$VoiceDir     = Join-Path $Root "voice"
$ManifestPath = Join-Path $VoiceDir "manifest.json"
$WordsPath    = Join-Path $Root "js\words.js"

if (-not (Test-Path $Zip)) { throw "No such zip: $Zip" }
if (-not (Test-Path $VoiceDir)) { New-Item -ItemType Directory -Path $VoiceDir | Out-Null }

# Known word ids and languages, so a stray file cannot quietly become a word
# the app has never heard of.
$src   = Get-Content $WordsPath -Raw -Encoding UTF8
$known = @{}
foreach ($m in [regex]::Matches($src, 'id:"([a-z0-9_-]+)"')) { $known[$m.Groups[1].Value] = $true }
$langs = @("en", "hi", "gu")

# ------------------------------------------------------------- manifest -----
$manifest = @{}
if (Test-Path $ManifestPath) {
  $o = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($p in $o.PSObject.Properties) { $manifest[$p.Name] = $p.Value }
}

# ------------------------------------------------------------------ unpack --
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $Zip))
$added = 0
$skipped = @()

try {
  foreach ($entry in $archive.Entries) {
    $name = Split-Path $entry.FullName -Leaf
    if (-not $name) { continue }
    if ($name -eq "manifest.json") { continue }   # rebuilt from the files themselves

    # word__lang.ext
    $m = [regex]::Match($name, '^(.+?)__(.+?)\.([a-z0-9]+)$')
    if (-not $m.Success) { $skipped += "$name (unrecognised name)"; continue }

    $word = $m.Groups[1].Value
    $lang = $m.Groups[2].Value

    if (-not $known.ContainsKey($word)) { $skipped += "$name (unknown word)"; continue }
    if ($langs -notcontains $lang)      { $skipped += "$name (unknown language)"; continue }
    if ($entry.Length -lt 500)          { $skipped += "$name (too small to be real audio)"; continue }

    $out = Join-Path $VoiceDir $name
    if ($WhatIf) {
      Write-Host ("would install {0}  ({1} bytes)" -f $name, $entry.Length) -ForegroundColor DarkGray
    } else {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $out, $true)
      Write-Host ("{0}|{1}  <- {2}  ({3} bytes)" -f $word, $lang, $name, $entry.Length) -ForegroundColor Green
    }
    $manifest["$word|$lang"] = $name
    $added++
  }
} finally {
  $archive.Dispose()
}

# Drop manifest rows whose file is no longer on disk, so a deleted recording
# cannot leave the service worker trying to precache a 404 for ever.
foreach ($key in @($manifest.Keys)) {
  if (-not (Test-Path (Join-Path $VoiceDir $manifest[$key]))) {
    if (-not $WhatIf) { $manifest.Remove($key) }
  }
}

if (-not $WhatIf) {
  # Set-Content -Encoding UTF8 writes a BOM on PowerShell 5.1, and a BOM makes
  # JSON.parse throw when the app reads this file. Write it BOM-less.
  $noBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 4), $noBom)
}

Write-Host ""
Write-Host "$added recording(s) $(if ($WhatIf) { 'would be installed' } else { 'installed' })." -ForegroundColor Cyan
Write-Host "$($manifest.Count) override(s) now in /voice/." -ForegroundColor Cyan
if ($skipped.Count) {
  Write-Host "$($skipped.Count) skipped:" -ForegroundColor Yellow
  $skipped | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}
if (-not $WhatIf) {
  Write-Host ""
  Write-Host "Remember to bump VERSION in sw.js so phones pick these up." -ForegroundColor DarkYellow
}

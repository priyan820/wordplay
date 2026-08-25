<#
  fetch-audio.ps1 - one-shot audio generator.

  THIS IS A WORKSHOP TOOL. It never runs on a phone and the app never calls it.
  Its only output is ordinary .mp3 files committed into the repo, which is why
  the deployed app has no network dependency for sound.

  For each word x {English, Hindi, Gujarati} it fetches one spoken clip of the
  NATIVE-SCRIPT text and saves it as audio/<word>__<lang>.mp3, then writes
  audio/manifest.json mapping "water|hi" -> "water__hi.mp3".

  Sindhi is absent on purpose. No Sindhi voice exists at this source (it returns
  a hard 400) and iOS ships none either. The alternatives were an Urdu or Hindi
  voice approximating Sindhi - which would teach a subtly wrong word every time -
  or leaving the language out. It was left out.

  Re-running skips clips that already exist, so it is always safe to run again.

  Usage:
    powershell -File fetch-audio.ps1
    powershell -File fetch-audio.ps1 -Redo water,milk
    powershell -File fetch-audio.ps1 -Lang gu

  NOTE ON VARIABLE NAMES: PowerShell variables are case-INSENSITIVE, so $Manifest
  and $manifest would be the same variable. Paths therefore carry a *Path suffix.
#>

[CmdletBinding()]
param(
  [string[]] $Redo = @(),
  [string]   $Lang = "",
  [int]      $DelayMs = 350
)

$ErrorActionPreference = "Stop"

$Root         = Split-Path -Parent $MyInvocation.MyCommand.Path
$WordsPath    = Join-Path $Root "js\words.js"
$AudioDir     = Join-Path $Root "audio"
$ManifestPath = Join-Path $AudioDir "manifest.json"

$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) wordplay-audio/1.0"

if (-not (Test-Path $AudioDir)) { New-Item -ItemType Directory -Path $AudioDir | Out-Null }

# --------------------------------------------------------------- word list ---
# Single source of truth: js/words.js. Parsed rather than duplicated, so the
# audio can never drift out of sync with the catalogue.
$src = Get-Content $WordsPath -Raw -Encoding UTF8

$words = @()
foreach ($m in [regex]::Matches($src, '(?s)\{\s*id:"([a-z0-9_-]+)".*?labels:\{(.*?)\}\s*\}\s*\},?')) {
  $id = $m.Groups[1].Value
  $labelBlock = $m.Groups[2].Value
  $entry = @{ id = $id; text = @{} }
  foreach ($lm in [regex]::Matches($labelBlock, '(en|hi|gu):\{\s*text:"([^"]*)"')) {
    $entry.text[$lm.Groups[1].Value] = $lm.Groups[2].Value
  }
  $words += [pscustomobject]$entry
}
Write-Host "Words parsed: $($words.Count)" -ForegroundColor Cyan

$langs = @("en", "hi", "gu")
if ($Lang) { $langs = @($Lang) }

$Redo = @($Redo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# ---------------------------------------------------------------- manifest ---
$manifest = @{}
if (Test-Path $ManifestPath) {
  $o = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($p in $o.PSObject.Properties) { $manifest[$p.Name] = $p.Value }
}

function Save-Manifest {
  # Set-Content -Encoding UTF8 writes a BOM on PowerShell 5.1, and a BOM makes
  # JSON.parse throw when the app reads this file. Write it BOM-less.
  $noBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 4), $noBom)
}

# ------------------------------------------------------------------ fetch ----
function Get-Clip($text, $lang, $outPath) {
  $url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
         $lang + "&q=" + [uri]::EscapeDataString($text)
  $r = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = $UA } -UseBasicParsing -TimeoutSec 30

  $type = "" + $r.Headers["Content-Type"]
  if ($type -notmatch "audio") { return "not audio ($type)" }

  # An error page can still arrive with a 200. A real clip of a single word is
  # never this small, so treat a runt as a failure rather than committing silence.
  if ($r.RawContentLength -lt 1200) { return "suspiciously small ($($r.RawContentLength) bytes)" }

  [System.IO.File]::WriteAllBytes($outPath, $r.Content)
  return $null
}

# ------------------------------------------------------------------- main ----
$made = 0
$skipped = 0
$failed = @()
$total = $words.Count * $langs.Count
$n = 0

foreach ($w in $words) {
  foreach ($lang in $langs) {
    $n++
    $key  = "$($w.id)|$lang"
    $name = "$($w.id)__$lang.mp3"
    $path = Join-Path $AudioDir $name
    $text = $w.text[$lang]

    if (-not $text) {
      Write-Host "[$n/$total] $key - no label, skipping" -ForegroundColor DarkYellow
      $failed += "$key (no label)"
      continue
    }

    if ((Test-Path $path) -and $manifest.ContainsKey($key) -and ($Redo -notcontains $w.id)) {
      $skipped++
      continue
    }

    try {
      $err = Get-Clip $text $lang $path
      if ($err) {
        Write-Host "[$n/$total] $key - FAILED: $err" -ForegroundColor Red
        $failed += "$key ($err)"
      } else {
        $manifest[$key] = $name
        $made++
        $size = (Get-Item $path).Length
        Write-Host "[$n/$total] $key  $text  ($size bytes)" -ForegroundColor Green
        if ($made % 20 -eq 0) { Save-Manifest }
      }
    } catch {
      $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "ERR" }
      Write-Host "[$n/$total] $key - FAILED ($code)" -ForegroundColor Red
      $failed += "$key ($code)"
    }

    Start-Sleep -Milliseconds $DelayMs
  }
}

Save-Manifest

Write-Host ""
Write-Host "Done. $made new clip(s), $skipped already present." -ForegroundColor Cyan
Write-Host "$($manifest.Count) of $total clips present." -ForegroundColor Cyan
if ($failed.Count) {
  Write-Host "$($failed.Count) failed:" -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

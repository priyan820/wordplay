<#
  fetch-images.ps1 - one-shot image fetcher. PowerShell twin of fetch-images.js.

  THIS IS A WORKSHOP TOOL. It never runs on a phone and the app never calls it.
  Its only output is ordinary .jpg files committed into the repo, so the
  deployed app has zero network dependency for images.

  Identical behaviour to fetch-images.js - same query, same filters, same
  output - but built on image tools already inside Windows, so it needs no
  Node, no npm and no installs of any kind.

  Usage:
    powershell -File fetch-images.ps1
    powershell -File fetch-images.ps1 -Redo spoon,ant,bus     # refetch these
    powershell -File fetch-images.ps1 -RejectFile rejects.txt # one word per line

  Re-running skips every word that already has an image, so it is always safe
  to run again.

  NOTE ON VARIABLE NAMES: PowerShell variables are case-INSENSITIVE, so $Manifest
  and $manifest are the same variable. An earlier version used $Manifest for the
  file path and $manifest for the data, and the data silently ate the path -
  every image downloaded but the manifest was never written. Hence the explicit
  *Path suffixes below. Do not rename them back.
#>

[CmdletBinding()]
param(
  [string[]] $Redo = @(),
  [string]   $RejectFile = "",
  [int]      $DelayMs = 300,
  [int]      $Size = 800,
  # Openverse is the default source, as specified. In practice its corpus is
  # Flickr-heavy and its top hit for a plain noun is often a scene rather than
  # one clear object - "bus" returned a bus ticket, "plate" a license plate,
  # "slipper" a slipper mushroom. Wikimedia Commons is much stronger for single
  # objects and has no rate limit, so this switch flips the order.
  [switch]   $CommonsFirst,
  # How confident a match must be before it is accepted. The bare-title bonus
  # is 25, so this threshold effectively demands a title that is essentially
  # just the word. Below it, the word keeps its emoji rather than take a photo
  # of something else.
  [int]      $MinScore = 25
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root         = Split-Path -Parent $MyInvocation.MyCommand.Path
$WordsPath    = Join-Path $Root "js\words.js"
$ImagesDir    = Join-Path $Root "images"
$ManifestPath = Join-Path $ImagesDir "manifest.json"
$RejectedPath = Join-Path $ImagesDir "rejected.json"
$NeedsPath    = Join-Path $Root "needs-image.txt"

$UA = "wordplay-image-fetch/1.0 (private family language app; contact via repo owner)"

# Titles that mean "not a single clear object a toddler can name".
$BadTitle = 'collage|\bset\b|collection|\bicon\b|vector|logo|diagram|clipart|pattern|wallpaper|texture'

# Titles that mean "a product photo of merchandise", which is how you end up
# with a jute shopping bag filed under "elephant" and a bleach bottle under
# "bottle". These are the ones that actually got through in practice.
$MerchTitle = 'detergent|bleach|shampoo|cleaner|packaging|\blabel\b|advert|for sale|\bshop\b|\bstore\b|t-shirt|tshirt|mug\b|poster|sticker|costume|tattoo|greeting card'

# Some bare English nouns are ambiguous and search badly. "plate" returns
# license plates, "star" returns galaxies, "sun" returns sunglasses, "slipper"
# returns a slipper mushroom. The word id stays the same everywhere - this only
# changes what gets typed into the search box.
$SearchHint = @{
  ball="beach ball"; bag="backpack"; balloon="balloons"; bed="bed bedroom"
  blocks="wooden toy building blocks"; bottle="water bottle"; bread="sliced bread"
  bucket="bucket"; bus="school bus"; car="red car"
  carrot="carrots vegetable"; chair="chair"; comb="hair comb"
  cookie="cookies biscuits"; cup="teacup"; doll="doll toy"; door="wooden door"
  ear="ear"; fan="table fan"; foot="feet"; grapes="bunch of grapes"
  hair="long hair"; hand="hand palm"; hat="hat cap"; key="door key"
  light="light bulb"; milk="milk"; mirror="mirror"; phone="smartphone"
  pillow="pillow"; plate="plate"; rain="rain"; rice="cooked rice bowl"
  road="road"; roti="chapati flatbread"; slipper="slippers footwear"
  soap="bar of soap"; socks="socks"; star="star shape"; stone="pebble"
  sun="sun in sky"; table="table"; teeth="human teeth"; toothbrush="toothbrush"
  towel="bath towel"; tree="tree"; water="glass of water"; window="window"
  ant="ant insect"; bird="bird"; butterfly="butterfly"; dog="dog"; fish="goldfish"
}

if (-not (Test-Path $ImagesDir)) { New-Item -ItemType Directory -Path $ImagesDir | Out-Null }

# ---------------------------------------------------------------- word list --
# Single source of truth: the ids in js/words.js. Never a second hard-coded list
# that can drift out of sync with the app.
$src   = Get-Content $WordsPath -Raw -Encoding UTF8
$words = [regex]::Matches($src, 'id:\s*"([a-z0-9_-]+)"') | ForEach-Object { $_.Groups[1].Value }
$words = @($words | Select-Object -Unique)
Write-Host "Words in catalogue: $($words.Count)" -ForegroundColor Cyan

if ($RejectFile -and (Test-Path $RejectFile)) {
  $Redo += @(Get-Content $RejectFile | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
}

# ------------------------------------------------------------- load state ----
function Read-JsonMap($path) {
  $map = @{}
  if (Test-Path $path) {
    $o = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $o.PSObject.Properties) { $map[$p.Name] = $p.Value }
  }
  return $map
}
$manifest = Read-JsonMap $ManifestPath
$rejects  = Read-JsonMap $RejectedPath

# PowerShell binds -Redo "a,b,c" as ONE array element containing the whole
# string, which silently matches no word at all and skips everything. Split
# here so both -Redo a,b,c and -Redo @("a","b") behave the same.
$Redo = @($Redo | ForEach-Object { $_ -split ',' } |
                  ForEach-Object { $_.Trim() } |
                  Where-Object   { $_ })
if ($Redo.Count) { Write-Host "Redo list: $($Redo.Count) word(s)" -ForegroundColor Yellow }

foreach ($w in $Redo) {
  if ($manifest.ContainsKey($w)) {
    # Remember the URL being rejected so the next search cannot pick it again.
    $old = $manifest[$w]
    if (-not $rejects.ContainsKey($w)) { $rejects[$w] = @() }
    $rejects[$w] = @($rejects[$w]) + @($old.direct)
    $manifest.Remove($w)
    $f = Join-Path $ImagesDir "$w.jpg"
    if (Test-Path $f) { Remove-Item $f -Force }
    Write-Host "  redo: $w (will avoid $($old.direct))" -ForegroundColor Yellow
  }
}

function Save-State {
  # Set-Content -Encoding UTF8 writes a BOM on Windows PowerShell 5.1, and a BOM
  # makes JSON.parse throw when the app reads manifest.json. Write it BOM-less.
  $noBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 6), $noBom)
  [System.IO.File]::WriteAllText($RejectedPath, ($rejects  | ConvertTo-Json -Depth 6), $noBom)
}

# ---------------------------------------------------------- rate limiting ----
# Openverse allows 20 requests/minute and 200/day anonymously. A flat 300ms
# delay would trip the burst cap after 20 words, so we read the budget back out
# of the response headers and wait for the window to roll when it runs low.
$script:BurstLeft = 20
function Wait-ForBudget {
  Start-Sleep -Milliseconds $DelayMs
  if ($script:BurstLeft -le 2) {
    Write-Host "  (burst budget spent - waiting 62s for the window to roll)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 62
    $script:BurstLeft = 20
  }
}

function Invoke-Openverse($query) {
  Wait-ForBudget
  $url = "https://api.openverse.org/v1/images/?q=" + [uri]::EscapeDataString($query) +
         "&license_type=all&size=medium"
  try {
    $r = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = $UA } -UseBasicParsing -TimeoutSec 30
    $b = $r.Headers["x-ratelimit-available-anon_burst"]
    if ($b) { $script:BurstLeft = [int]$b }
    return ($r.Content | ConvertFrom-Json).results
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 429) {
      Write-Host "  (rate limited - waiting 62s)" -ForegroundColor DarkGray
      Start-Sleep -Seconds 62
      $script:BurstLeft = 20
      return @()
    }
    Write-Host "  openverse error: $($_.Exception.Message)" -ForegroundColor DarkGray
    return @()
  }
}

function Invoke-Commons($query) {
  Start-Sleep -Milliseconds $DelayMs
  $url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
         "&gsrsearch=" + [uri]::EscapeDataString("filetype:bitmap $query") +
         "&gsrlimit=20&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata" +
         "&iiurlwidth=1200&format=json"
  try {
    $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $UA } -TimeoutSec 30
    if (-not $r.query) { return @() }
    $out = @()
    foreach ($p in $r.query.pages.PSObject.Properties) {
      $pg = $p.Value
      if (-not $pg.imageinfo) { continue }
      $ii = $pg.imageinfo[0]
      $out += [pscustomobject]@{
        title    = ($pg.title -replace '^File:', '' -replace '\.[a-z]+$', '')
        direct   = $(if ($ii.thumburl) { $ii.thumburl } else { $ii.url })
        page     = $ii.descriptionurl
        creator  = $(if ($ii.extmetadata.Artist) { ($ii.extmetadata.Artist.value -replace '<[^>]+>','').Trim() } else { "Wikimedia Commons" })
        license  = $(if ($ii.extmetadata.LicenseShortName) { $ii.extmetadata.LicenseShortName.value } else { "see page" })
        provider = "wikimedia"
      }
    }
    return $out
  } catch {
    Write-Host "  commons error: $($_.Exception.Message)" -ForegroundColor DarkGray
    return @()
  }
}

# ------------------------------------------------------------- candidates ----
# Scoring, rather than a plain first-usable-wins. Openverse sorts by relevance,
# which is not the same as "one clear object a three-year-old can name" - the
# top hit for "elephant isolated" was a jute shopping bag with an elephant
# printed on it.
function Get-Score($c, $word) {
  if (-not $c.direct) { return -100 }
  if ($c.direct -match '\.svgz?($|\?)') { return -100 }
  if ($rejects.ContainsKey($word) -and (@($rejects[$word]) -contains $c.direct)) { return -100 }

  $t = ("" + $c.title).ToLower()
  if ($t -match $BadTitle)   { return -100 }
  if ($t -match $MerchTitle) { return -100 }

  $score = 0
  if ($t -match ('\b' + [regex]::Escape($word) + 's?\b')) { $score += 10 }

  # A title that is essentially JUST the word ("Carrot", "Carrots", "Red bus")
  # is almost always a photograph of that one thing. This is the single most
  # reliable signal available, so it outweighs everything else.
  $bare = ($t -replace '[^a-z ]', ' ') -replace '\s+', ' '
  $bare = $bare.Trim()
  if ($bare -match ('^(a |an |the |red |blue |green |yellow |white |black |wooden |fresh |single )*' +
                    [regex]::Escape($word) + 's?( on white| isolated| closeup| close up)?$')) {
    $score += 25
  }

  # A title naming a DIFFERENT object from our own catalogue is usually a photo
  # of that other object. "Elephant market bag" is a bag.
  foreach ($other in $words) {
    if ($other -eq $word) { continue }
    if ($t -match ('\b' + [regex]::Escape($other) + 's?\b')) { $score -= 8 }
  }

  if ($t.Length -le 45) { $score += 2 }   # short titles tend to be single objects
  if ($t -match 'isolated|white background|close-?up') { $score += 3 }
  return $score
}

function Get-Ranked($results, $word, $provider) {
  $scored = @()
  foreach ($r in $results) {
    $c = if ($provider -eq "openverse") {
      [pscustomobject]@{
        title = $r.title; direct = $r.url; page = $r.foreign_landing_url
        creator = $r.creator; license = $r.license; provider = "openverse/$($r.source)"
      }
    } else { $r }
    $s = Get-Score $c $word
    if ($s -gt -100) { $scored += [pscustomobject]@{ score = $s; cand = $c } }
  }
  return @($scored | Sort-Object -Property score -Descending)
}

# ---------------------------------------------------------- image pipeline ---
function Save-Square($bytes, $outPath) {
  # Centre-crop to a square FIRST, then scale to exactly $Size. Doing it this way
  # gives a true 800x800 every time; scaling the long edge first would leave the
  # cropped square smaller than 800 on most source images.
  $ms = New-Object System.IO.MemoryStream(, $bytes)
  try {
    $img = [System.Drawing.Image]::FromStream($ms)
    try {
      if ($img.Width -lt 400 -or $img.Height -lt 400) { return "too small ($($img.Width)x$($img.Height))" }
      $side = [Math]::Min($img.Width, $img.Height)
      $sx   = [int](($img.Width  - $side) / 2)
      $sy   = [int](($img.Height - $side) / 2)

      $out = New-Object System.Drawing.Bitmap($Size, $Size)
      try {
        $g = [System.Drawing.Graphics]::FromImage($out)
        try {
          $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $g.DrawImage($img,
            (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)),
            (New-Object System.Drawing.Rectangle($sx, $sy, $side, $side)),
            [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $g.Dispose() }

        # Drawing into a brand-new bitmap leaves EXIF/GPS/colour profiles behind,
        # so the saved file carries no metadata from the original.
        $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
               Where-Object { $_.MimeType -eq "image/jpeg" }
        $ps  = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                         [System.Drawing.Imaging.Encoder]::Quality, 82)
        $out.Save($outPath, $enc, $ps)
        $ps.Dispose()
        return $null
      } finally { $out.Dispose() }
    } finally { $img.Dispose() }
  } finally { $ms.Dispose() }
}

function Get-Bytes($url) {
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add("User-Agent", $UA)
  try { return $wc.DownloadData($url) } finally { $wc.Dispose() }
}

function Try-Save($ranked, $word, $file, $minScore, $query) {
  foreach ($row in $ranked) {
    if ($row.score -lt $minScore) { break }
    $c = $row.cand
    try {
      $bytes = Get-Bytes $c.direct
      $err   = Save-Square $bytes $file
      if ($err) { continue }
      $manifest[$word] = [pscustomobject]@{
        file = "$word.jpg"; title = $c.title; source = $c.page; direct = $c.direct
        creator = $c.creator; license = $c.license; provider = $c.provider
        score = $row.score; fetchedAt = (Get-Date).ToString("s"); query = $query
      }
      Write-Host ("    ok [score {0}] <{1}> {2}" -f $row.score, $c.license, $c.title) -ForegroundColor Green
      Save-State
      return $true
    } catch { continue }
  }
  return $false
}

# ------------------------------------------------------------------- main ----
$needs = @()
$done  = 0
$got   = 0

foreach ($word in $words) {
  $done++
  $file = Join-Path $ImagesDir "$word.jpg"
  if ($manifest.ContainsKey($word) -and (Test-Path $file)) {
    Write-Host "[$done/$($words.Count)] $word - already have it, skipping" -ForegroundColor DarkGray
    continue
  }

  Write-Host "[$done/$($words.Count)] $word" -ForegroundColor White
  $saved = $false
  $pool  = @()

  $term = $(if ($SearchHint.ContainsKey($word)) { $SearchHint[$word] } else { $word })
  if ($term -ne $word) { Write-Host "    searching for: $term" -ForegroundColor DarkGray }

  if ($CommonsFirst) {
    $ranked = Get-Ranked (Invoke-Commons $term) $word "commons"
    $pool  += $ranked
    if ($ranked.Count) { $saved = Try-Save $ranked $word $file $MinScore $term }
  }

  # Openverse, with modifiers that bias towards one clear object. Stop as soon
  # as something scores well, so a typical word costs a single API call.
  foreach ($modifier in @("isolated", "single", "")) {
    if ($saved) { break }
    $q = $(if ($modifier) { "$term $modifier" } else { $term })
    $ranked = Get-Ranked (Invoke-Openverse $q) $word "openverse"
    $pool  += $ranked
    if ($ranked.Count) { $saved = Try-Save $ranked $word $file $MinScore $q }
  }

  # Wikimedia Commons fallback (when it was not already tried first).
  if (-not $saved -and -not $CommonsFirst) {
    Write-Host "    openverse found nothing usable, trying Commons" -ForegroundColor DarkYellow
    $ranked = Get-Ranked (Invoke-Commons $term) $word "commons"
    $pool  += $ranked
    if ($ranked.Count) { $saved = Try-Save $ranked $word $file $MinScore $term }
  }

  # Deliberately NO low-bar fallback. Accepting the best of a bad set is how
  # "bread" became a snowy landscape and "plate" became a license plate. A
  # word with no confident match keeps its emoji, which is a complete and
  # honest screen - far better than a photograph of the wrong thing.

  if ($saved) { $got++ }
  else {
    Write-Host "    NOTHING USABLE - staying on emoji" -ForegroundColor Red
    $needs += $word
  }
}

# ----------------------------------------------------------------- output ----
Save-State

if ($needs.Count) {
  $noBom  = New-Object System.Text.UTF8Encoding($false)
  $header = "Words with no usable image. They fall back to their emoji, which is a" + [Environment]::NewLine +
            "perfectly good screen - fix only if you want to." + [Environment]::NewLine + [Environment]::NewLine
  [System.IO.File]::WriteAllText($NeedsPath, $header + ($needs -join [Environment]::NewLine), $noBom)
} elseif (Test-Path $NeedsPath) {
  Remove-Item $NeedsPath -Force
}

Write-Host ""
Write-Host "Done. $got new image(s). $($manifest.Count) of $($words.Count) words have photos." -ForegroundColor Cyan
if ($needs.Count) { Write-Host "$($needs.Count) still on emoji - see needs-image.txt" -ForegroundColor Yellow }


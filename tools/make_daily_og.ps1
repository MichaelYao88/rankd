# Renders og/daily/<date>.png for each crawlable daily page in _site/daily.
#
# Why a script instead of the build: the site deploys as static files, and the build
# has no image library. The PNGs are committed, so Cloudflare and GitHub Pages serve
# them directly. Run this after tools/build_review_site.js when a new day appears,
# then rebuild so the pages pick up the new files. Missing images fall back to og.png.
#
# Windows only (System.Drawing). Usage:
#   powershell -ExecutionPolicy Bypass -File tools/make_daily_og.ps1
#   powershell -ExecutionPolicy Bypass -File tools/make_daily_og.ps1 -Only 2026-11-11
param(
  [string]$SiteDir = (Join-Path $PSScriptRoot "..\_site"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\og\daily"),
  [string]$Only = ""
)

Add-Type -AssemblyName System.Drawing

$ink = [System.Drawing.ColorTranslator]::FromHtml("#151821")
$muted = [System.Drawing.ColorTranslator]::FromHtml("#6C6B67")
$brand = [System.Drawing.ColorTranslator]::FromHtml("#3B5BFF")
$bg = [System.Drawing.ColorTranslator]::FromHtml("#EAE7E0")
$card = [System.Drawing.ColorTranslator]::FromHtml("#FFFFFF")
$line = [System.Drawing.ColorTranslator]::FromHtml("#EDEAE3")

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Decode-Html([string]$s) {
  if ($null -eq $s) { return "" }
  $s = $s -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"' -replace '&#39;', "'" -replace '&nbsp;', ' '
  $s = [regex]::Replace($s, '&#(\d+);', { param($m) [char][int]$m.Groups[1].Value })
  return $s
}

function Clean-Text([string]$s) {
  # Keep the card readable: Latin text and normal punctuation only.
  $s = Decode-Html $s
  $s = [regex]::Replace($s, '[^\u0020-\u007E\u00A0-\u024F\u2013\u2014\u2018\u2019\u201C\u201D\u2026]', '')
  return ($s -replace '\s+', ' ').Trim()
}

function Wrap-Text([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [float]$maxWidth) {
  $words = $text -split ' '
  $lines = New-Object System.Collections.Generic.List[string]
  $cur = ""
  foreach ($w in $words) {
    $try = if ($cur) { "$cur $w" } else { $w }
    if ($g.MeasureString($try, $font).Width -le $maxWidth) { $cur = $try }
    else {
      if ($cur) { $lines.Add($cur) }
      $cur = $w
    }
  }
  if ($cur) { $lines.Add($cur) }
  return $lines
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$dailyDir = Join-Path $SiteDir "daily"
$files = Get-ChildItem -Path $dailyDir -Filter "*.html" | Where-Object { $_.BaseName -match '^\d{4}-\d{2}-\d{2}$' }
if ($Only) { $files = $files | Where-Object { $_.BaseName -eq $Only } }
if (-not $files) { throw "no daily pages in $dailyDir" }

$made = 0
foreach ($file in $files) {
  $date = $file.BaseName
  $html = Get-Content -Raw -Encoding UTF8 -Path $file.FullName
  $h1 = [regex]::Match($html, '<h1>(.*?)</h1>', 'Singleline')
  $title = Clean-Text $h1.Groups[1].Value
  if (-not $title) { $title = Clean-Text ([regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value) }
  if (-not $title) { continue }
  $noMatch = [regex]::Match($html, 'daily puzzle #(\d+)')
  $dayNo = if ($noMatch.Success) { $noMatch.Groups[1].Value } else { "" }

  $bmp = New-Object System.Drawing.Bitmap 1200, 630
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($bg)

  $path = New-RoundedPath 56 56 1088 518 44
  $g.FillPath((New-Object System.Drawing.SolidBrush $card), $path)
  $path.Dispose()

  $brandFont = New-Object System.Drawing.Font "Segoe UI", 40, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $brandBrush = New-Object System.Drawing.SolidBrush $ink
  $brandBlue = New-Object System.Drawing.SolidBrush $brand
  $g.DrawString("ranki", $brandFont, $brandBrush, 112, 104)
  $brandWidth = $g.MeasureString("ranki", $brandFont).Width
  $g.DrawString(".gg", $brandFont, $brandBlue, 112 + $brandWidth - 16, 104)

  if ($dayNo) {
    $noFont = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $noText = "No. $dayNo"
    $noWidth = $g.MeasureString($noText, $noFont).Width
    $g.DrawString($noText, $noFont, (New-Object System.Drawing.SolidBrush $muted), 1088 - $noWidth, 118)
  }

  # Shrink the headline until it fits in three lines.
  $maxWidth = 960
  $font = $null
  $lines = $null
  foreach ($size in @(56, 50, 44, 38, 34, 30)) {
    $candidate = New-Object System.Drawing.Font "Segoe UI", $size, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $wrapped = Wrap-Text $g $title $candidate $maxWidth
    if ($wrapped.Count -le 3) { $font = $candidate; $lines = $wrapped; break }
    $candidate.Dispose()
  }
  if (-not $font) {
    $font = New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $lines = Wrap-Text $g $title $font $maxWidth
  }

  $lineHeight = $font.Size * 1.22
  $total = $lines.Count * $lineHeight
  $y = 218 + [Math]::Max(0, (196 - $total) / 2)
  $titleBrush = New-Object System.Drawing.SolidBrush $ink
  foreach ($line in $lines) {
    $g.DrawString($line, $font, $titleBrush, 112, [float]$y)
    $y += $lineHeight
  }

  # The question, when there is room. It makes the card informative without spoiling.
  $ledeMatch = [regex]::Match($html, '<p class="lede">(.*?)</p>', 'Singleline')
  $lede = Clean-Text $ledeMatch.Groups[1].Value
  if ($lede -and $lines.Count -le 2) {
    $subFont = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    if ($g.MeasureString($lede, $subFont).Width -gt $maxWidth) {
      $fitted = ""
      foreach ($word in ($lede -split ' ')) {
        $try = if ($fitted) { "$fitted $word" } else { $word }
        if ($g.MeasureString($try + [char]0x2026, $subFont).Width -gt $maxWidth) { break }
        $fitted = $try
      }
      $lede = ($fitted.TrimEnd() + [char]0x2026)
    }
    $g.DrawString($lede, $subFont, (New-Object System.Drawing.SolidBrush $muted), 112, [float]($y + 4))
    $subFont.Dispose()
  }

  $dateText = [DateTime]::ParseExact($date, "yyyy-MM-dd", $null).ToString("dddd, d MMMM yyyy", [System.Globalization.CultureInfo]::GetCultureInfo("en-GB"))
  $metaFont = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($dateText, $metaFont, (New-Object System.Drawing.SolidBrush $muted), 112, 524)

  # Six squares, one per card slot. Purely decorative, no answer.
  $colors = @("#16B364", "#F5B82E", "#EF4A4F", "#3B5BFF", "#FFE48A", "#151821")
  $x = 112
  foreach ($hex in $colors) {
    $sq = New-RoundedPath $x 466 34 34 9
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))), $sq)
    $sq.Dispose()
    $x += 44
  }

  $tagFont = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $tag = "A daily game of surprising stats"
  $tagWidth = $g.MeasureString($tag, $tagFont).Width
  $g.DrawString($tag, $tagFont, (New-Object System.Drawing.SolidBrush $muted), 1088 - $tagWidth, 534)

  $outPath = Join-Path $OutDir "$date.png"
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $font.Dispose()
  $made++
}

Write-Output "daily og: $made image(s) in $OutDir"

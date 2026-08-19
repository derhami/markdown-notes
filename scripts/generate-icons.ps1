# Generate PWA / app icons for Markdown Notes using System.Drawing
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "public"
$out = Join-Path (Split-Path $PSScriptRoot -Parent) "public"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# Derhami monogram family: dark gradient bg, white letters, accent dot
$bgTop = [System.Drawing.Color]::FromArgb(39, 39, 42)     # #27272a
$bgBottom = [System.Drawing.Color]::FromArgb(24, 24, 27)  # #18181b
$ink    = [System.Drawing.Color]::FromArgb(255, 255, 255) # white
$dot    = [System.Drawing.Color]::FromArgb(62, 90, 128)   # #3E5A80

function New-RoundedRect([System.Drawing.RectangleF]$r, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $radius
    $path.AddArc($r.X, $r.Y, $d, $d, 180, 90)
    $path.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
    $path.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-MDIcon([int]$size, [bool]$maskable, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # Background: full-bleed dark gradient
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        $bgTop,
        $bgBottom,
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $g.FillRectangle($brush, $bgRect)

    # Glyph safe zone (maskable safe area is inner 80% = 0.4 radius)
    $safe = [float]$size * 0.5
    $glyphSize = [float]$size * 0.42
    $glyphX = ($size - $glyphSize) / 2
    $glyphY = ($size - $glyphSize) / 2 - $size * 0.02
    $rect = New-Object System.Drawing.RectangleF($glyphX, $glyphY, $glyphSize, $glyphSize)
    $fontEm = $size * 0.24
    $font = New-Object System.Drawing.Font("Georgia", $fontEm, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $b = New-Object System.Drawing.SolidBrush($ink)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("MD", $font, $b, $rect, $sf)

    # Accent dot (bottom-right, matching monogram family)
    $dotR = [float]$size * 0.043
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($dot)),
        $size - $size * 0.19 - $dotR, $size - $size * 0.19 - $dotR, $dotR * 2, $dotR * 2)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $brush.Dispose()
}

New-MDIcon 192 $false (Join-Path $out "pwa-192x192.png")
New-MDIcon 512 $false (Join-Path $out "pwa-512x512.png")
New-MDIcon 512 $true  (Join-Path $out "pwa-512x512-maskable.png")
New-MDIcon 180 $false (Join-Path $out "apple-touch-icon.png")
New-MDIcon 32  $true  (Join-Path $out "favicon-32x32.png")

Write-Output "Icons generated:"
Get-ChildItem $out | ForEach-Object { "$($_.Name)  $($_.Length) bytes" }

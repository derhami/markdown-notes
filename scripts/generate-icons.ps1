# Generate PWA / app icons for Markdown Notes using System.Drawing
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "public"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$accent = [System.Drawing.Color]::FromArgb(62, 90, 128)   # #3E5A80
$ink    = [System.Drawing.Color]::FromArgb(250, 249, 246) # #FAF9F6

function New-MDIcon([int]$size, [bool]$maskable, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($maskable) {
        # Full-bleed accent background (maskable safe zone is 80% center)
        $bg = New-Object System.Drawing.SolidBrush($accent)
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $safe = [float]$size * 0.5   # use only the inner 80% (=0.4 radius) for glyph
        $glyphSize = [float]$size * 0.52
        $glyphX = ($size - $glyphSize) / 2
        $glyphY = ($size - $glyphSize) / 2 - $size * 0.03
        $rect = New-Object System.Drawing.RectangleF($glyphX, $glyphY, $glyphSize, $glyphSize)
        $fontEm = $size * 0.30
        $font = New-Object System.Drawing.Font("Georgia", $fontEm, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $b = New-Object System.Drawing.SolidBrush($ink)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString("M", $font, $b, $rect, $sf)
    } else {
        # Light background with centered accent rounded square and white "M"
        $g.Clear($ink)
        $pad = [float]$size * 0.16
        $sq = [float]$size - 2 * $pad
        $sqRect = New-Object System.Drawing.RectangleF($pad, $pad, $sq, $sq)
        $radius = [float]$size * 0.10
        $pathgd = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = 2 * $radius
        $pathgd.AddArc($sqRect.X, $sqRect.Y, $d, $d, 180, 90)
        $pathgd.AddArc($sqRect.Right - $d, $sqRect.Y, $d, $d, 270, 90)
        $pathgd.AddArc($sqRect.Right - $d, $sqRect.Bottom - $d, $d, $d, 0, 90)
        $pathgd.AddArc($sqRect.X, $sqRect.Bottom - $d, $d, $d, 90, 90)
        $pathgd.CloseFigure()
        $bsh = New-Object System.Drawing.SolidBrush($accent)
        $g.FillPath($bsh, $pathgd)

        $fontEm = $size * 0.30
        $font = New-Object System.Drawing.Font("Georgia", $fontEm, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $w = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString("M", $font, $w, $sqRect, $sf)
    }

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

New-MDIcon 192 $false (Join-Path $out "pwa-192x192.png")
New-MDIcon 512 $false (Join-Path $out "pwa-512x512.png")
New-MDIcon 512 $true  (Join-Path $out "pwa-512x512-maskable.png")
New-MDIcon 180 $false (Join-Path $out "apple-touch-icon.png")
New-MDIcon 32  $true  (Join-Path $out "favicon-32x32.png")

Write-Output "Icons generated:"
Get-ChildItem $out | ForEach-Object { "$($_.Name)  $($_.Length) bytes" }
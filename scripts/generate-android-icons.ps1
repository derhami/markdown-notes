Add-Type -AssemblyName System.Drawing
$src512 = Join-Path $PSScriptRoot "..\public\pwa-512x512.png"
$srcMask = Join-Path $PSScriptRoot "..\public\pwa-512x512-maskable.png"
$base = Join-Path $PSScriptRoot "..\android\app\src\main\res"

function Resize-Png([string]$src, [int]$size, [string]$dest) {
    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap($img, $size, $size)
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $img.Dispose()
}

$sizes = @{
  'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192
}

foreach ($dpi in $sizes.Keys) {
    $d = Join-Path $base "mipmap-$dpi"
    Resize-Png $src512 $sizes[$dpi] (Join-Path $d "ic_launcher.png")
    Resize-Png $src512 $sizes[$dpi] (Join-Path $d "ic_launcher_round.png")
    Resize-Png $srcMask $sizes[$dpi] (Join-Path $d "ic_launcher_foreground.png")
}

Write-Output "Android launcher icons generated across $($sizes.Count) densities"
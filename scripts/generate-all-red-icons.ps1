Add-Type -AssemblyName System.Drawing

$sourceImg = 'C:\Users\User\.gemini\antigravity\scratch\qjo-ai\public\red-logo-source\qjo-logo-transparent.png'
$redDir = 'C:\Users\User\.gemini\antigravity\scratch\qjo-ai\public\red-logo-source'
$publicDir = 'C:\Users\User\.gemini\antigravity\scratch\qjo-ai\public'

function Resize-Image($srcPath, $dstPath, $w, $h) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    $graph.Clear([System.Drawing.Color]::Transparent)
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graph.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graph.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graph.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graph.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

$targets = @{
    'qjo-logo.png' = @(1024, 1024)
    'favicon.png' = @(512, 512)
    'apple-touch-icon.png' = @(180, 180)
    'icon-16.png' = @(16, 16)
    'icon-32.png' = @(32, 32)
    'icon-48.png' = @(48, 48)
    'icon-64.png' = @(64, 64)
    'icon-128.png' = @(128, 128)
    'icon-180.png' = @(180, 180)
    'icon-192.png' = @(192, 192)
    'icon-256.png' = @(256, 256)
    'icon-512.png' = @(512, 512)
}

foreach ($item in $targets.GetEnumerator()) {
    $filename = $item.Key
    $w = $item.Value[0]
    $h = $item.Value[1]
    
    $dstInRed = Join-Path $redDir $filename
    $dstInPublic = Join-Path $publicDir $filename
    
    Resize-Image $sourceImg $dstInRed $w $h
    Copy-Item $dstInRed $dstInPublic -Force
    Write-Host "Generated $filename (${w}x${h}) [Transparent corners]"
}

# Generate favicon.ico (multi-res or 32x32 transparent)
$img32 = [System.Drawing.Image]::FromFile($sourceImg)
$bmp32 = New-Object System.Drawing.Bitmap(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g32 = [System.Drawing.Graphics]::FromImage($bmp32)
$g32.Clear([System.Drawing.Color]::Transparent)
$g32.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g32.DrawImage($img32, 0, 0, 32, 32)

$hIcon = $bmp32.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoDstRed = Join-Path $redDir 'favicon.ico'
$icoDstPublic = Join-Path $publicDir 'favicon.ico'

$fsRed = [System.IO.File]::OpenWrite($icoDstRed)
$icon.Save($fsRed)
$fsRed.Close()

$fsPub = [System.IO.File]::OpenWrite($icoDstPublic)
$icon.Save($fsPub)
$fsPub.Close()

$g32.Dispose()
$bmp32.Dispose()
$img32.Dispose()
Write-Host "Generated favicon.ico [Transparent corners]"

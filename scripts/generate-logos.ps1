Add-Type -AssemblyName System.Drawing

$sourceImg = 'C:\Users\User\.gemini\antigravity\brain\1a4cc4f0-81a8-44c5-814e-5e13d794f62c\.user_uploaded\media__1791048927782.png'
$publicDir = 'C:\Users\User\.gemini\antigravity\scratch\qjo-ai\public'
$backupDir = Join-Path $publicDir 'legacy-logo-backup'
$redDir = Join-Path $publicDir 'red-logo-source'

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
}
if (-not (Test-Path $redDir)) {
    New-Item -ItemType Directory -Force -Path $redDir | Out-Null
}

# Step 1: Backup legacy blue icons
$filesToBackup = @(
    'qjo-logo.png', 'favicon.png', 'apple-touch-icon.png',
    'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-64.png',
    'icon-128.png', 'icon-180.png', 'icon-192.png', 'icon-256.png', 'icon-512.png'
)

foreach ($f in $filesToBackup) {
    $src = Join-Path $publicDir $f
    $dst = Join-Path $backupDir $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
    }
}
Write-Host '[Backup] Legacy blue logos backed up to public/legacy-logo-backup/'

# Step 2: Resize function
function Resize-Image($srcPath, $dstPath, $w, $h) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
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

foreach ($key in $targets.Keys) {
    $outRed = Join-Path $redDir $key
    $outPublic = Join-Path $publicDir $key
    $dims = $targets[$key]
    Resize-Image -srcPath $sourceImg -dstPath $outRed -w $dims[0] -h $dims[1]
    Copy-Item -Path $outRed -Destination $outPublic -Force
}

Write-Host '[Success] Red logos generated and deployed into public/'

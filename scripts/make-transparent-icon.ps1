Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\User\.gemini\antigravity\brain\1a4cc4f0-81a8-44c5-814e-5e13d794f62c\.user_uploaded\media__1791048927782.png'
$outPath = 'C:\Users\User\.gemini\antigravity\scratch\qjo-ai\public\red-logo-source\qjo-logo-transparent.png'

$src = [System.Drawing.Bitmap][System.Drawing.Image]::FromFile($srcPath)
$w = $src.Width
$h = $src.Height

# Create 32-bit ARGB bitmap
$dst = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Copy all pixels first
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $dst.SetPixel($x, $y, $src.GetPixel($x, $y))
    }
}
$src.Dispose()

# Queue-based flood fill to make the outer white background transparent
$visited = New-Object 'bool[,]' $w, $h
$queue = New-Object System.Collections.Generic.Queue[System.Drawing.Point]

# Seed from four corners
$corners = @(
    [System.Drawing.Point]::new(0, 0),
    [System.Drawing.Point]::new($w - 1, 0),
    [System.Drawing.Point]::new(0, $h - 1),
    [System.Drawing.Point]::new($w - 1, $h - 1)
)

foreach ($pt in $corners) {
    $c = $dst.GetPixel($pt.X, $pt.Y)
    if ($c.R -gt 230 -and $c.G -gt 230 -and $c.B -gt 230) {
        $queue.Enqueue($pt)
        $visited[$pt.X, $pt.Y] = $true
    }
}

while ($queue.Count -gt 0) {
    $curr = $queue.Dequeue()
    $cx = $curr.X
    $cy = $curr.Y
    
    # Set to completely transparent
    $dst.SetPixel($cx, $cy, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))

    $neighbors = @(
        [System.Drawing.Point]::new($cx + 1, $cy),
        [System.Drawing.Point]::new($cx - 1, $cy),
        [System.Drawing.Point]::new($cx, $cy + 1),
        [System.Drawing.Point]::new($cx, $cy - 1)
    )

    foreach ($n in $neighbors) {
        if ($n.X -ge 0 -and $n.X -lt $w -and $n.Y -ge 0 -and $n.Y -lt $h) {
            if (-not $visited[$n.X, $n.Y]) {
                $nc = $dst.GetPixel($n.X, $n.Y)
                # If neighbor is white/near-white background
                if ($nc.R -gt 230 -and $nc.G -gt 230 -and $nc.B -gt 230) {
                    $visited[$n.X, $n.Y] = $true
                    $queue.Enqueue($n)
                }
            }
        }
    }
}

# Smooth antialiasing along border (1-pixel transition)
for ($y = 1; $y -lt ($h - 1); $y++) {
    for ($x = 1; $x -lt ($w - 1); $x++) {
        $c = $dst.GetPixel($x, $y)
        if ($c.A -gt 0) {
            # Check if any neighbor is transparent
            $hasTranspNeighbor = (
                $dst.GetPixel($x+1, $y).A -eq 0 -or
                $dst.GetPixel($x-1, $y).A -eq 0 -or
                $dst.GetPixel($x, $y+1).A -eq 0 -or
                $dst.GetPixel($x, $y-1).A -eq 0
            )
            if ($hasTranspNeighbor -and ($c.R -gt 200 -and $c.G -gt 150 -and $c.B -gt 150)) {
                # Edge antialiasing for near-white border bleed
                $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(120, $c.R, $c.G, $c.B))
            }
        }
    }
}

$dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
Write-Host "Transparent icon saved to: $outPath"

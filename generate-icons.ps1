# generate-icons.ps1 - Creates WalletGuard Pro icons (16, 48, 128) using GDI+

Add-Type -AssemblyName System.Drawing

function New-WalletGuardIcon {
    param(
        [int]$Size,
        [string]$Path
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $w = [double]$Size
    $h = [double]$Size

    # Shield outline (relative coords 0..1) with smooth curves
    $shieldPath = New-Object System.Drawing.Drawing2D.GraphicsPath

    # Top edge
    $shieldPath.AddLine(
        (New-Object System.Drawing.PointF([float](0.16 * $w), [float](0.10 * $h))),
        (New-Object System.Drawing.PointF([float](0.84 * $w), [float](0.10 * $h)))
    )

    # Right side down
    $shieldPath.AddLine(
        (New-Object System.Drawing.PointF([float](0.84 * $w), [float](0.10 * $h))),
        (New-Object System.Drawing.PointF([float](0.84 * $w), [float](0.55 * $h)))
    )

    # Right curve to bottom
    $shieldPath.AddBezier(
        (New-Object System.Drawing.PointF([float](0.84 * $w), [float](0.55 * $h))),
        (New-Object System.Drawing.PointF([float](0.83 * $w), [float](0.72 * $h))),
        (New-Object System.Drawing.PointF([float](0.68 * $w), [float](0.88 * $h))),
        (New-Object System.Drawing.PointF([float](0.50 * $w), [float](0.94 * $h)))
    )

    # Left curve from bottom
    $shieldPath.AddBezier(
        (New-Object System.Drawing.PointF([float](0.50 * $w), [float](0.94 * $h))),
        (New-Object System.Drawing.PointF([float](0.32 * $w), [float](0.88 * $h))),
        (New-Object System.Drawing.PointF([float](0.17 * $w), [float](0.72 * $h))),
        (New-Object System.Drawing.PointF([float](0.16 * $w), [float](0.55 * $h)))
    )

    # Left side up
    $shieldPath.AddLine(
        (New-Object System.Drawing.PointF([float](0.16 * $w), [float](0.55 * $h))),
        (New-Object System.Drawing.PointF([float](0.16 * $w), [float](0.10 * $h)))
    )
    $shieldPath.CloseFigure()

    # Two-tone fill: lighter blue on left, darker blue on right
    $lightBlue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 144, 255))
    $darkBlue  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 13, 71, 161))

    $g.SetClip((New-Object System.Drawing.Rectangle(0, 0, [int]($w / 2), $Size)))
    $g.FillPath($lightBlue, $shieldPath)
    $g.ResetClip()

    $g.SetClip((New-Object System.Drawing.Rectangle([int]($w / 2), 0, [int]($w / 2), $Size)))
    $g.FillPath($darkBlue, $shieldPath)
    $g.ResetClip()

    # White "W" centered
    $fontSize = [Math]::Max([single]($Size * 0.55), [single]6)
    $font = New-Object System.Drawing.Font("Arial Black", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $whiteBrush = [System.Drawing.Brushes]::White
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, [float]($h * 0.05), [float]$w, [float]($h * 0.80))
    $g.DrawString("W", $font, $whiteBrush, $rect, $sf)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

# Create icons folder if missing
$iconsDir = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

# Generate three sizes
New-WalletGuardIcon -Size 16  -Path (Join-Path $iconsDir "icon16.png")
New-WalletGuardIcon -Size 48  -Path (Join-Path $iconsDir "icon48.png")
New-WalletGuardIcon -Size 128 -Path (Join-Path $iconsDir "icon128.png")

Write-Host "Icons generated in: $iconsDir" -ForegroundColor Green
Get-ChildItem $iconsDir | Format-Table Name, Length

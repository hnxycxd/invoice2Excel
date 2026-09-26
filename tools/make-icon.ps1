# Generate src-tauri/icons/icon.ico (blue rounded square + yen sign)
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# rounded rect background
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 52
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
$path.AddArc(0, $size - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

# white yen glyph
$font = New-Object System.Drawing.Font('Arial', 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 4, $size, ($size - 4))
$g.DrawString([string][char]0x00A5, $font, $white, $rect, $fmt)
$g.Dispose()

$outDir = Join-Path $PSScriptRoot "..\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outPath = [System.IO.Path]::GetFullPath((Join-Path $outDir "icon.ico"))

# classic BMP-frame ico via GetHicon (best compat for resource embedding)
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($outPath)
$icon.Save($fs)
$fs.Dispose()
$icon.Dispose()
$bmp.Dispose()
Write-Host "created: $outPath"

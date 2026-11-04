param(
  [Parameter(Mandatory=$true)][string]$Board,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [Parameter(Mandatory=$true)][int]$StartIndex,
  [int]$Grid = 4,
  [int]$CellOut = 96
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $Board).Path)
$w = $img.Width; $h = $img.Height
Write-Output "BOARD $Board : ${w}x${h}"
$cell = [math]::Floor([math]::Min($w, $h) / $Grid)
$ox = [math]::Floor(($w - $cell * $Grid) / 2)
$oy = [math]::Floor(($h - $cell * $Grid) / 2)
$i = $StartIndex
$bad = 0
for ($r = 0; $r -lt $Grid; $r++) {
  for ($c = 0; $c -lt $Grid; $c++) {
    $bmp = New-Object System.Drawing.Bitmap($CellOut, $CellOut)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $src = New-Object System.Drawing.Rectangle(($ox + $c * $cell), ($oy + $r * $cell), $cell, $cell)
    $dst = New-Object System.Drawing.Rectangle(0, 0, $CellOut, $CellOut)
    $g.DrawImage($img, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
    $name = Join-Path $OutDir ("icon-{0:d2}.png" -f $i)
    $bmp.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    $sz = (Get-Item $name).Length
    if ($sz -lt 1024) { $bad++; Write-Output "  SUSPECT $name ($sz bytes)" }
    $i++
  }
}
$img.Dispose()
Write-Output "WROTE 16 icons ($StartIndex..$($i-1)) bad=$bad"

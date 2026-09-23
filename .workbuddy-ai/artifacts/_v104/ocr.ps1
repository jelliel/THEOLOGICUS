# v104 — lire le texte d'une image avec le moteur OCR de Windows.
# Usage : powershell -ExecutionPolicy Bypass -File ocr.ps1 "C:\chemin\image.png"
param([Parameter(Mandatory=$true)][string]$Path)

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($op, $type) {
    $asTask = $asTaskGeneric.MakeGenericMethod($type)
    $task = $asTask.Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    return $task.Result
}

if (-not (Test-Path $Path)) { Write-Output "FICHIER ABSENT : $Path"; exit 1 }

$file   = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decode = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decode.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = $null
foreach ($tag in @('fr-FR','en-US')) {
    try { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $tag)) } catch {}
    if ($null -ne $engine) { Write-Output "--- moteur OCR : $tag ---"; break }
}
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    Write-Output "--- moteur OCR : langue du profil ---"
}
if ($null -eq $engine) { Write-Output "AUCUN MOTEUR OCR DISPONIBLE"; exit 2 }

$res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
foreach ($line in $res.Lines) {
    $b = $line.BoundingRect
    Write-Output ("[{0,4},{1,4}] {2}" -f [int]$b.X, [int]$b.Y, $line.Text)
}

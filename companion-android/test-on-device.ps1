# Installs the debug APK on the connected J3, starts the server, forwards the
# port over USB, and exercises the API end-to-end. No tunnel involved — this
# proves NewPipeExtractor works on the device itself.
$ErrorActionPreference = "Stop"
$adb = "C:\Users\ULTRA PC\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
$apk = "C:\Projects\OVERnOVER\companion-android\app\build\outputs\apk\debug\app-debug.apk"

Write-Host "== install =="
& $adb install -r $apk

Write-Host "== start service =="
& $adb shell am startservice -n com.overnover.companion/.CompanionService
Start-Sleep -Seconds 3

Write-Host "== forward port =="
& $adb forward tcp:8080 tcp:8080

Write-Host "== /health =="
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 20 | Select-Object -ExpandProperty Content

Write-Host "`n== /search?q=daft punk =="
$search = Invoke-WebRequest -Uri "http://localhost:8080/search?q=daft%20punk" -UseBasicParsing -TimeoutSec 40
$results = $search.Content | ConvertFrom-Json
$results | Select-Object -First 3 | ForEach-Object { "  $($_.artist) - $($_.title)  [$($_.id)] ${($_.duration)}s" }
$firstId = $results[0].id

Write-Host "`n== /stream/$firstId (first 128KB) =="
$req = [System.Net.HttpWebRequest]::Create("http://localhost:8080/stream/$firstId")
$req.Timeout = 40000
$req.AddRange(0, 131071)
$resp = $req.GetResponse()
$stream = $resp.GetResponseStream()
$buf = New-Object byte[] 131072
$read = 0
while ($read -lt 131072) { $n = $stream.Read($buf, $read, 131072 - $read); if ($n -le 0) { break }; $read += $n }
$resp.Close()
$ftyp = [System.Text.Encoding]::ASCII.GetString($buf[4..7])
Write-Host "  fetched $read bytes; box type at offset 4 = '$ftyp' (expect 'ftyp' for MP4/M4A)"

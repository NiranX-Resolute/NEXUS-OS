$ErrorActionPreference = 'Stop'
$url = 'https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/NEXUS-V3-Spatial-v5.0.0-WebSetup.exe'
$tmp = Join-Path $env:TEMP 'NEXUS-V3-Spatial-v5.0.0-WebSetup.exe'
Write-Host "Downloading NEXUS V3 Spatial lightweight installer (nexus-v3-spatial-5.0.0-x64.nsis.7z on demand)..."
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
Start-Process -FilePath $tmp -Wait

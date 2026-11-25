$ErrorActionPreference = 'Stop'
$url = 'https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/NEXUS-V4-Minimal-v5.0.0-WebSetup.exe'
$tmp = Join-Path $env:TEMP 'NEXUS-V4-Minimal-v5.0.0-WebSetup.exe'
Write-Host "Downloading NEXUS V4 Minimal lightweight installer (nexus-v4-minimal-5.0.0-x64.nsis.7z on demand)..."
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
Start-Process -FilePath $tmp -Wait

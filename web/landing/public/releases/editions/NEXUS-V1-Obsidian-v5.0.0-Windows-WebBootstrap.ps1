$ErrorActionPreference = 'Stop'
$url = 'https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/NEXUS-V1-Obsidian-v5.0.0-WebSetup.exe'
$tmp = Join-Path $env:TEMP 'NEXUS-V1-Obsidian-v5.0.0-WebSetup.exe'
Write-Host "Downloading NEXUS V1 Obsidian lightweight installer (nexus-v1-obsidian-5.0.0-x64.nsis.7z on demand)..."
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
Start-Process -FilePath $tmp -Wait

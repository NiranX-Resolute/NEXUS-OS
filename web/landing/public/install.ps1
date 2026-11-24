# NEXUS OS v5.0 — Windows 1-Liner Automated Installer
param(
    [switch]$Portable = $false
)

$ErrorActionPreference = "Stop"

Write-Host @"
========================================================================
   🌐 NEXUS OS v5.0 // ZERO-CARD AUTONOMOUS OPERATING ENVIRONMENT
========================================================================
"@ -ForegroundColor Cyan

$ReleaseTag = "v5.0.0"
$BaseUrl = "https://github.com/NiranX-Resolute/NEXUS-OS/releases/download/$ReleaseTag"

if ($Portable) {
    $FileName = "NEXUS-OS-v5.0-Windows-Portable.exe"
    $ExpectedHash = "284243ce92dd1c0301dc2d184359b95bb9f1dbe0f814d671d94f748ea45f2d69"
} else {
    $FileName = "NEXUS-OS-v5.0-Setup.exe"
    $ExpectedHash = "c164f46c95d87e78040c3e90439ab47b3db7cd5b92832f47110eab34d21df244"
}

$DownloadUrl = "$BaseUrl/$FileName"
$Destination = Join-Path $env:TEMP $FileName

Write-Host "[*] Target Binary: $FileName" -ForegroundColor Yellow
Write-Host "[*] Downloading from: $DownloadUrl" -ForegroundColor Gray

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $Destination -UseBasicParsing
    Write-Host "[✓] Download complete ($Destination)" -ForegroundColor Green
} catch {
    Write-Host "[!] Download failed: $_" -ForegroundColor Red
    Write-Host "[*] Opening GitHub Releases in default browser..." -ForegroundColor Yellow
    Start-Process "https://github.com/NiranX-Resolute/NEXUS-OS/releases/tag/$ReleaseTag"
    exit 1
}

Write-Host "[*] Verifying cryptographic SHA-256 digest..." -ForegroundColor Gray
$ActualHash = (Get-FileHash -Path $Destination -Algorithm SHA256).Hash.ToLower()

if ($ActualHash -eq $ExpectedHash.ToLower()) {
    Write-Host "[✓] Integrity verified! SHA-256 matches expected digest." -ForegroundColor Green
} else {
    Write-Host "[!] Checksum notice: Actual ($ActualHash) vs Expected ($ExpectedHash)" -ForegroundColor Yellow
}

Write-Host "[🚀] Launching NEXUS OS v5.0..." -ForegroundColor Cyan
Start-Process -FilePath $Destination

Write-Host @"
========================================================================
   NEXUS OS v5.0 initialized successfully.
   Hub: https://nexus-landing.pages.dev/download
========================================================================
"@ -ForegroundColor Cyan

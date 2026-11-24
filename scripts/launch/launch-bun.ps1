# Nexus OS - Sovereign Bun Desktop Workstation Launcher
param (
    [switch]$Dev = $false,
    [switch]$Install = $false
)

$RootDir = (Resolve-Path "$PSScriptRoot\..\..").Path
$BunDir = "$RootDir\apps\desktop-bun"

if ($Install) {
    & "$BunDir\install.ps1" -LaunchAfterInstall
} else {
    & "$BunDir\launch.ps1" -Dev:$Dev
}

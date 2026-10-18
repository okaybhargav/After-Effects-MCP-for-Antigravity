<#
.SYNOPSIS
    Diagnoses the After Effects MCP environment, CEP installation, Antigravity config, and live bridge health.
#>
[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    nodeVersion = $null
    npmVersion = $null
    afterEffectsInstalled = $false
    afterEffectsPath = "C:\Program Files\Adobe\Adobe After Effects CC 2019\Support Files\AfterFX.exe"
    afterEffectsVersion = $null
    afterEffectsRunning = $false
    afterEffectsProcessId = $null
    cepExtensionInstalled = $false
    cepExtensionPath = (Join-Path $env:APPDATA "Adobe\CEP\extensions\com.antigravity.aftereffects.mcp")
    antigravityConfigPath = (Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json")
    antigravityConfigured = $false
    bridgeStateFileExists = $false
    bridgeReachable = $false
    bridgeStatus = $null
}

# 1. Node & npm
try {
    $report.nodeVersion = (& node --version 2>$null).Trim()
} catch {}
try {
    $report.npmVersion = (& npm.cmd --version 2>$null).Trim()
} catch {}

# 2. After Effects executable
if (Test-Path -LiteralPath $report.afterEffectsPath -PathType Leaf) {
    $report.afterEffectsInstalled = $true
    $report.afterEffectsVersion = (Get-Item -LiteralPath $report.afterEffectsPath).VersionInfo.ProductVersion
} else {
    if (Test-Path "C:\Program Files\Adobe") {
        $candidates = Get-ChildItem -Path "C:\Program Files\Adobe" -Directory -Filter "*After Effects*"
        foreach ($c in $candidates) {
            $testExe = Join-Path $c.FullName "Support Files\AfterFX.exe"
            if (Test-Path -LiteralPath $testExe -PathType Leaf) {
                $report.afterEffectsInstalled = $true
                $report.afterEffectsPath = $testExe
                $report.afterEffectsVersion = (Get-Item -LiteralPath $testExe).VersionInfo.ProductVersion
                break
            }
        }
    }
}

# 3. Running process
$aeProc = Get-Process -Name "AfterFX" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $aeProc) {
    $report.afterEffectsRunning = $true
    $report.afterEffectsProcessId = $aeProc.Id
}

# 4. CEP Extension Installed
$installedManifest = Join-Path $report.cepExtensionPath "CSXS\manifest.xml"
if (Test-Path -LiteralPath $installedManifest -PathType Leaf) {
    $report.cepExtensionInstalled = $true
}

# 5. Antigravity MCP Config
if (Test-Path -LiteralPath $report.antigravityConfigPath -PathType Leaf) {
    try {
        $cfg = Get-Content -LiteralPath $report.antigravityConfigPath -Raw | ConvertFrom-Json
        if ($null -ne $cfg.mcpServers -and $null -ne $cfg.mcpServers.'after-effects') {
            $report.antigravityConfigured = $true
        }
    } catch {}
}

# 6. Bridge State & Live HTTP Status
$stateFile = Join-Path $projectRoot ".bridge-state.json"
if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
    $report.bridgeStateFileExists = $true
    try {
        $stateJson = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        $port = if ($stateJson.port) { $stateJson.port } else { 17892 }
        $token = $stateJson.token
        if ($token) {
            $uri = "http://127.0.0.1:$port/api/panel/status"
            $resp = Invoke-RestMethod -Uri $uri -Headers @{ "X-AE-Bridge-Token" = $token } -Method Get -TimeoutSec 2 -ErrorAction Stop
            $report.bridgeReachable = $true
            $report.bridgeStatus = $resp
        }
    } catch {}
}

if ($Json) {
    $report | ConvertTo-Json -Depth 6
    exit 0
}

Write-Host "=== After Effects MCP Diagnostic Report ===" -ForegroundColor Magenta
Write-Host ("Node.js Version         : {0}" -f $(if ($report.nodeVersion) { $report.nodeVersion } else { "MISSING" }))
Write-Host ("npm Version             : {0}" -f $(if ($report.npmVersion) { $report.npmVersion } else { "MISSING" }))
Write-Host ("After Effects Installed : {0} ({1})" -f $(if ($report.afterEffectsInstalled) { "Installed" } else { "NOT FOUND" }), $(if ($report.afterEffectsVersion) { $report.afterEffectsVersion } else { "N/A" }))
Write-Host ("Executable Path         : {0}" -f $report.afterEffectsPath)
Write-Host ("AE Running Now          : {0}" -f $(if ($report.afterEffectsRunning) { "YES (PID $($report.afterEffectsProcessId))" } else { "NO" }))
Write-Host ("CEP Extension Installed : {0} ({1})" -f $(if ($report.cepExtensionInstalled) { "YES" } else { "NO" }), $report.cepExtensionPath)
Write-Host ("Antigravity MCP Config  : {0} ({1})" -f $(if ($report.antigravityConfigured) { "CONFIGURED" } else { "NOT CONFIGURED" }), $report.antigravityConfigPath)
Write-Host ("Bridge State File       : {0}" -f $(if ($report.bridgeStateFileExists) { "PRESENT" } else { "NOT YET CREATED" }))
Write-Host ("Live Bridge Reachable   : {0}" -f $(if ($report.bridgeReachable) { "YES (Panel Connected: $($report.bridgeStatus.panelConnected))" } else { "NO (Starts when MCP server runs)" }))

<#
.SYNOPSIS
    Installs the After Effects MCP Bridge CEP extension for Adobe After Effects CC 2018 - 2025+.

.DESCRIPTION
    Copies C:\MCP\After Effect MCP\cep-extension into the current user's CEP extensions folder:
    %APPDATA%\Adobe\CEP\extensions\com.antigravity.aftereffects.mcp
    Does not touch any other Adobe extensions.
#>
[CmdletBinding()]
param(
    [string]$SourceDir = "",
    [string]$ExtensionId = "com.antigravity.aftereffects.mcp",
    [switch]$EnablePlayerDebugMode
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SourceDir)) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $SourceDir = Join-Path $projectRoot "cep-extension"
}

Write-Host "=== After Effects MCP CEP Extension Installer ===" -ForegroundColor Magenta

# 1. Verify source directory and manifest
if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    throw "CEP source directory not found: $SourceDir"
}

$manifestPath = Join-Path $SourceDir "CSXS\manifest.xml"
$hostJsxPath  = Join-Path $SourceDir "host\aftereffects.jsx"
$panelJsPath  = Join-Path $SourceDir "panel.js"
$indexPath    = Join-Path $SourceDir "index.html"

foreach ($requiredFile in @($manifestPath, $hostJsxPath, $panelJsPath, $indexPath)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required CEP extension file missing: $requiredFile"
    }
}

# 2. Check Adobe After Effects installation
$aeDefaultExe = "C:\Program Files\Adobe\Adobe After Effects CC 2019\Support Files\AfterFX.exe"
if (Test-Path -LiteralPath $aeDefaultExe -PathType Leaf) {
    $ver = (Get-Item -LiteralPath $aeDefaultExe).VersionInfo.ProductVersion
    Write-Host "[OK] Found Adobe After Effects CC 2019 ($ver) at $aeDefaultExe" -ForegroundColor Green
} else {
    $found = $false
    if (Test-Path "C:\Program Files\Adobe") {
        $candidates = Get-ChildItem -Path "C:\Program Files\Adobe" -Directory -Filter "*After Effects*"
        foreach ($c in $candidates) {
            $testExe = Join-Path $c.FullName "Support Files\AfterFX.exe"
            if (Test-Path -LiteralPath $testExe -PathType Leaf) {
                $ver = (Get-Item -LiteralPath $testExe).VersionInfo.ProductVersion
                Write-Host "[OK] Found Adobe After Effects ($ver) at $testExe" -ForegroundColor Green
                $found = $true
                break
            }
        }
    }
    if (-not $found) {
        Write-Host "[WARN] Adobe After Effects not found at default path. Ensure After Effects is installed." -ForegroundColor Yellow
    }
}

# 3. Ensure user CEP extensions directory exists and is writable
$cepRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
if (-not (Test-Path -LiteralPath $cepRoot -PathType Container)) {
    Write-Host "Creating user CEP extensions directory: $cepRoot" -ForegroundColor Yellow
    New-Item -Path $cepRoot -ItemType Directory -Force | Out-Null
}

$targetDir = Join-Path $cepRoot $ExtensionId
Write-Host "Installing extension to: $targetDir" -ForegroundColor Cyan

# 4. Remove previous version of this specific extension cleanly
if (Test-Path -LiteralPath $targetDir) {
    Write-Host "Removing existing extension folder: $targetDir" -ForegroundColor Yellow
    Remove-Item -LiteralPath $targetDir -Recurse -Force
}

New-Item -Path $targetDir -ItemType Directory -Force | Out-Null

# 5. Copy extension files
Copy-Item -Path (Join-Path $SourceDir "*") -Destination $targetDir -Recurse -Force

# 6. Verify installation
$installedManifest = Join-Path $targetDir "CSXS\manifest.xml"
if (-not (Test-Path -LiteralPath $installedManifest -PathType Leaf)) {
    throw "Installation failed: manifest.xml not present at $installedManifest"
}

Write-Host "[OK] CEP extension installed successfully to $targetDir" -ForegroundColor Green

# 7. PlayerDebugMode check
$debugKeys = @("CSXS.8", "CSXS.9", "CSXS.10", "CSXS.11", "CSXS.12", "CSXS.13", "CSXS.14", "CSXS.15", "CSXS.16")
foreach ($dk in $debugKeys) {
    $regPath = "HKCU:\Software\Adobe\$dk"
    if (Test-Path $regPath) {
        $val = (Get-ItemProperty -Path $regPath -Name "PlayerDebugMode" -ErrorAction SilentlyContinue).PlayerDebugMode
        if ($val -eq "1" -or $val -eq 1) {
            Write-Host "[OK] $regPath PlayerDebugMode is already set to 1." -ForegroundColor Green
        }
    }
}

Write-Host "`nNext step in Adobe After Effects:" -ForegroundColor Cyan
Write-Host "  Open After Effects -> Window -> Extensions -> After Effects MCP Bridge`n" -ForegroundColor White

<#
.SYNOPSIS
    Uninstalls the After Effects MCP CEP extension cleanly.
#>
[CmdletBinding()]
param(
    [string]$ExtensionId = "com.antigravity.aftereffects.mcp"
)

$ErrorActionPreference = "Stop"

$targetDir = Join-Path $env:APPDATA "Adobe\CEP\extensions\$ExtensionId"
Write-Host "=== After Effects MCP Extension Uninstaller ===" -ForegroundColor Magenta

if (Test-Path -LiteralPath $targetDir) {
    Write-Host "Removing extension folder: $targetDir" -ForegroundColor Yellow
    Remove-Item -LiteralPath $targetDir -Recurse -Force
    Write-Host "[OK] After Effects CEP extension uninstalled successfully." -ForegroundColor Green
} else {
    Write-Host "[INFO] Extension was not installed at: $targetDir" -ForegroundColor Cyan
}

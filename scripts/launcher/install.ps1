$ErrorActionPreference = 'Stop'

try {
    Write-Host ''
    Write-Host '============================================'
    Write-Host ' Savetax App Launcher Setup'
    Write-Host '============================================'
    Write-Host ''

    $installDir = Join-Path $env:USERPROFILE 'savetax-launcher'
    $psSource = Join-Path $PSScriptRoot 'launcher.ps1'
    $psTarget = Join-Path $installDir 'launcher.ps1'

    Write-Host "Install location: $installDir"
    Write-Host ''

    if (-not (Test-Path -LiteralPath $psSource)) {
        Write-Host "[ERROR] launcher.ps1 not found: $psSource" -ForegroundColor Red
        Write-Host 'Place install.bat, install.ps1, launcher.ps1 in the same folder.'
        exit 1
    }

    if (-not (Test-Path -LiteralPath $installDir)) {
        New-Item -ItemType Directory -Path $installDir | Out-Null
    }
    Copy-Item -LiteralPath $psSource -Destination $psTarget -Force
    Write-Host '[1/2] launcher.ps1 copied' -ForegroundColor Green

    $cmdValue = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $psTarget + '" "%1"'

    New-Item -Path 'HKCU:\Software\Classes\savetax-app' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name '(Default)' -Value 'URL:Savetax App Launcher'
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name 'URL Protocol' -Value ''
    New-Item -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Name '(Default)' -Value $cmdValue
    Write-Host '[2/2] Protocol registered (savetax-app://)' -ForegroundColor Green

    Write-Host ''
    Write-Host '============================================'
    Write-Host ' DONE!' -ForegroundColor Green
    Write-Host '============================================'
    Write-Host ''
    Write-Host 'Test: paste this in browser address bar:'
    Write-Host '  savetax-app://folder?path=C:\Users'
    Write-Host ''
    Write-Host 'When browser asks "Open savetax-app?", check'
    Write-Host '"Always allow" and click Open.'
    Write-Host ''
} catch {
    Write-Host ''
    Write-Host '[ERROR]' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Write-Host $_.ScriptStackTrace
}

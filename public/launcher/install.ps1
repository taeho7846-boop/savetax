$ErrorActionPreference = 'Stop'

try {
    Write-Host ''
    Write-Host '============================================'
    Write-Host ' Savetax App Launcher 설치'
    Write-Host '============================================'
    Write-Host ''

    $installDir = Join-Path $env:USERPROFILE 'savetax-launcher'
    $psSource = Join-Path $PSScriptRoot 'launcher.ps1'
    $psTarget = Join-Path $installDir 'launcher.ps1'

    Write-Host "설치 위치: $installDir"
    Write-Host ''

    if (-not (Test-Path -LiteralPath $psSource)) {
        Write-Host "[오류] launcher.ps1 을 찾을 수 없습니다: $psSource" -ForegroundColor Red
        Write-Host 'install.bat 와 launcher.ps1 을 같은 폴더에 두고 실행해주세요.'
        exit 1
    }

    if (-not (Test-Path -LiteralPath $installDir)) {
        New-Item -ItemType Directory -Path $installDir | Out-Null
    }
    Copy-Item -LiteralPath $psSource -Destination $psTarget -Force
    Write-Host '[1/2] launcher.ps1 복사 완료' -ForegroundColor Green

    $cmdValue = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $psTarget + '" "%1"'

    New-Item -Path 'HKCU:\Software\Classes\savetax-app' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name '(Default)' -Value 'URL:Savetax App Launcher'
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name 'URL Protocol' -Value ''
    New-Item -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Name '(Default)' -Value $cmdValue
    Write-Host '[2/2] 프로토콜 등록 완료 (savetax-app://)' -ForegroundColor Green

    Write-Host ''
    Write-Host '============================================'
    Write-Host ' 설치 완료!' -ForegroundColor Green
    Write-Host '============================================'
    Write-Host ''
    Write-Host '테스트: 브라우저 주소창에 붙여넣기'
    Write-Host '  savetax-app://folder?path=C:\Users'
    Write-Host ''
    Write-Host '브라우저가 "savetax-app을(를) 열려고 합니다" 라고 묻거든'
    Write-Host '"항상 허용" 체크 후 열기.'
    Write-Host ''
} catch {
    Write-Host ''
    Write-Host '[오류 발생]' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Write-Host $_.ScriptStackTrace
}

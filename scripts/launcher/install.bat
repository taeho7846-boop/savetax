@echo off
setlocal
chcp 65001 >nul

echo.
echo ============================================
echo  Savetax App Launcher 설치
echo ============================================
echo.

set "INSTALL_DIR=%USERPROFILE%\savetax-launcher"
set "PS_SOURCE=%~dp0launcher.ps1"
set "PS_TARGET=%INSTALL_DIR%\launcher.ps1"

echo 설치 위치: %INSTALL_DIR%
echo.

if not exist "%PS_SOURCE%" (
    echo [오류] launcher.ps1 을 찾을 수 없습니다: %PS_SOURCE%
    echo install.bat 와 launcher.ps1 을 같은 폴더에 두고 실행해주세요.
    pause
    exit /b 1
)

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /Y "%PS_SOURCE%" "%PS_TARGET%" >nul
if errorlevel 1 (
    echo [오류] 파일 복사 실패
    pause
    exit /b 1
)
echo [1/2] launcher.ps1 복사 완료

set "CMD_VALUE=powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%PS_TARGET%\" \"%%1\""

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cmd = $env:CMD_VALUE; ^
   New-Item -Path 'HKCU:\Software\Classes\savetax-app' -Force | Out-Null; ^
   Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name '(Default)' -Value 'URL:Savetax App Launcher'; ^
   Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app' -Name 'URL Protocol' -Value ''; ^
   New-Item -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Force | Out-Null; ^
   Set-ItemProperty -Path 'HKCU:\Software\Classes\savetax-app\shell\open\command' -Name '(Default)' -Value $cmd"

if errorlevel 1 (
    echo [오류] 레지스트리 등록 실패
    pause
    exit /b 1
)
echo [2/2] 프로토콜 등록 완료 ^(savetax-app://^)
echo.
echo ============================================
echo  설치 완료!
echo ============================================
echo.
echo 테스트: 아래 주소를 브라우저 주소창에 붙여넣기
echo   savetax-app://folder?path=C:\Users
echo.
echo 정상이면 파일탐색기로 C:\Users 가 열립니다.
echo.
pause

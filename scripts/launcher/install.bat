@echo off
chcp 65001 >nul
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo (창을 닫으려면 아무 키나 누르세요)
pause >nul

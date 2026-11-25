@echo off
rem Drag a decrypted PS5 GTA VI save (.zip or folder) onto this file. See README.md first.
if "%~1"=="" (
  echo Drag a decrypted PS5 save .zip or folder onto this file.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Import-PS5Save.ps1" "%~1" -AutoLoad
pause

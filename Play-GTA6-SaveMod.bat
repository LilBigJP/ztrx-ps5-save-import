@echo off
rem Put this file in your ztrx folder (next to Cargo.toml), after applying ztrx-save-patch.diff and rebuilding.
rem Set GAME to your own game exe. DATA must match the folder the importer writes to.
set "GAME=C:\path\to\your\game\game_scarlett_master.exe"
set "DATA=%LOCALAPPDATA%\ztrx\data"
set "CACHE=%LOCALAPPDATA%\ztrx\cache"

cd /d "%~dp0"
if not exist "%GAME%" ( echo Edit this file: GAME does not point at your game exe. & pause & exit /b 1 )
if not exist "target\release\victory.exe" ( echo Build ztrx first: cargo build --release -p victory & pause & exit /b 1 )
set VICTORY_KEYS=
set VICTORY_CAPTURE=
set VICTORY_CAPTURE_FRAMES=
set VICTORY_DUMP_TARGETS=
rem Story-save encryption check patched off in memory (game files are not changed).
set "VICTORY_PATCH=0x28d0d60=31c0c3:ffc9f7c1f7ffffff0f94c0c3"
set "VICTORY_DATA_DIR=%DATA%"
set "VICTORY_CACHE_DIR=%CACHE%"
if not exist "%DATA%" mkdir "%DATA%"
if not exist "%CACHE%" mkdir "%CACHE%"
"%~dp0target\release\victory.exe" run "%GAME%" --execute > "%TEMP%\ztrx.log" 2>&1
echo Exited with %ERRORLEVEL%; log: %TEMP%\ztrx.log
pause

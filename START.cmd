@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul
title TestDaF-Trainer
cd /d "%~dp0"

echo ==========================================
echo   TestDaF-Trainer / B2-Trainer
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden.
  echo Bitte Node.js 20 oder neuer installieren: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Erster Start: Abhaengigkeiten werden installiert ^(npm install^).
  echo Das dauert einige Minuten und braucht Internet.
  echo.
  call npm install
  if errorlevel 1 (
    echo FEHLER: npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

set "MODUS=%~1"
if /i "%MODUS%"=="" goto menue
if /i "%MODUS%"=="dev" goto dev
if /i "%MODUS%"=="preview" goto preview
if /i "%MODUS%"=="build" goto bauen
goto menue

:menue
echo Was soll gestartet werden?
echo   [1] Dev-Server   - schnell, mit Live-Reload
echo   [2] Preview      - baut die Seite, dann lokaler Server
echo   [3] Nur bauen    - npm run build, Ergebnis in dist\
echo   [0] Abbrechen
echo.
set "WAHL="
set /p "WAHL=Bitte waehlen [1]: "
if "%WAHL%"=="" set "WAHL=1"
if "%WAHL%"=="1" goto dev
if "%WAHL%"=="2" goto preview
if "%WAHL%"=="3" goto bauen
if "%WAHL%"=="0" exit /b 0
echo Ungueltige Eingabe.
echo.
goto menue

:dev
echo.
echo Starte Dev-Server:  http://localhost:4321/testdaf/
call :browser 5
call npm run dev -- --port 4321
goto ende

:preview
echo.
echo Baue die Seite - der TestDaF-Validator laeuft als prebuild mit ...
call npm run build
if errorlevel 1 (
  echo.
  echo FEHLER: Build fehlgeschlagen - siehe Ausgabe oben.
  pause
  exit /b 1
)
echo.
echo Starte Preview-Server:  http://localhost:4321/testdaf/
call :browser 3
call npx astro preview --port 4321
goto ende

:bauen
call npm run build
echo.
if errorlevel 1 (
  echo FEHLER: Build fehlgeschlagen.
  pause
  exit /b 1
)
echo Fertig. Die gebaute Seite liegt in dist\.
pause
exit /b 0

:browser
if /i "%START_NO_BROWSER%"=="1" exit /b 0
start "" cmd /c "timeout /t %~1 >nul & start http://localhost:4321/testdaf/"
exit /b 0

:ende
echo.
echo Server beendet.
pause
exit /b 0

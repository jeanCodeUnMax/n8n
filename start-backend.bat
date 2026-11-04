@echo off
REM Lance le back-end n8n en mode dev (watch + rebuild automatique).
REM Pour la version buildee (production locale) : utiliser "pnpm start" a la place.

setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] pnpm introuvable dans le PATH. Installe-le via : npm i -g pnpm
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo node_modules absent - installation des dependances...
    call pnpm install
    if errorlevel 1 (
        echo [ERREUR] pnpm install a echoue.
        pause
        exit /b 1
    )
)

echo Lancement du back-end n8n (pnpm dev:be)...
echo UI : http://localhost:5678
call pnpm dev:be

if errorlevel 1 (
    echo.
    echo [ERREUR] Le back-end s'est arrete avec une erreur.
    pause
)
endlocal

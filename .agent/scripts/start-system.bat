@echo off
TITLE Hephaistos2-Kit — REST + Ingestion
echo === Hephaistos2-Kit : demarrage manuel ===
echo.

REM hphe-rest (gateway 127.0.0.1:8792 + boucle d'ingestion 900s)
REM Normalement auto-demarre via Startup\hphe-rest.cmd — ici en secours.
curl -s http://127.0.0.1:8792/health >nul 2>&1
if errorlevel 1 (
    echo [rest] hphe-rest absent — lancement...
    if not defined HPHE_INSTALL set HPHE_INSTALL=%ProgramFiles%\servers\hephaistos2-kit
    if exist "%HPHE_INSTALL%\extension\server\hphe-rest.cmd" (
        start "hphe-rest" /min "%HPHE_INSTALL%\extension\server\hphe-rest.cmd"
    ) else (
        echo [rest] hphe-rest.cmd introuvable dans %HPHE_INSTALL% - relance install.ps1
    )
) else (
    echo [rest] hphe-rest deja actif.
)

echo.
REM Ingestion du workspace courant (via REST, file d'attente serialisee)
echo [ingest] auto-ingestion du workspace...
start "AGENT Ingestion" /B pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-ingest.ps1" -Mode auto

echo.
echo === OK ===
echo Monitor: extension VSIX orchestrator-monitor (panel IDE, ws-bridge :7477)
echo Sante  : curl http://127.0.0.1:8792/health
echo.
pause

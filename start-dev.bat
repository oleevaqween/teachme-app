@echo off
cd /d "%~dp0"
start "TeachMe Dev Server" cmd /k "set NODE_OPTIONS=--use-system-ca&& npm run dev"
timeout /t 5 /nobreak >nul
start "" http://localhost:3000

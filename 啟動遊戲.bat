@echo off
title Three Kingdoms Fish Machine (Vite Dev)
cd /d "%~dp0"
echo ============================================
echo   Three Kingdoms Fish Machine - DEMO (Vite HMR)
echo   Edit src/*.js or style.css and save to hot-reload
echo   Close this window to stop the dev server
echo ============================================
if not exist "node_modules" call npm install
call npm run dev
pause

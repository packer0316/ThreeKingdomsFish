@echo off
title Three Kingdoms Fish Machine - Electron Packager
cd /d "%~dp0"
echo ============================================
echo   Three Kingdoms Fish Machine - Electron
echo   1) npm install   2) vite build   3) package
echo   Output: release\ThreeKingdomsFish-win32-x64
echo ============================================

echo.
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/3] Building web bundle (vite build)...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [3/3] Packaging Electron app...
call npm run electron:pack
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   DONE!
echo   Run: release\ThreeKingdomsFish-win32-x64\ThreeKingdomsFish.exe
echo ============================================
pause
exit /b 0

:fail
echo.
echo ============================================
echo   PACKAGING FAILED - see error above
echo ============================================
pause
exit /b 1

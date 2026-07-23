@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Naeil Special Canvas Build
echo [Naeil Special Canvas] Checking and building distribution files.
echo [0/4] Syncing app and Skill contract files.
node "%~dp0scripts\contracts.mjs" sync
if errorlevel 1 goto error
node "%~dp0scripts\contracts.mjs" check
if errorlevel 1 goto error
set "RUNTIME=%LOCALAPPDATA%\NaeilSpecialCanvasRuntime"
if not exist "%RUNTIME%\node_modules\vite\bin\vite.js" goto installerror
copy /y "%~dp0runtime\vite.runtime.config.mjs" "%RUNTIME%\vite.runtime.config.mjs" >nul
if not exist "%RUNTIME%\app\src" mkdir "%RUNTIME%\app\src"
xcopy /e /i /y "%~dp0src" "%RUNTIME%\app\src" >nul
if not exist "%RUNTIME%\app\fixtures" mkdir "%RUNTIME%\app\fixtures"
xcopy /e /i /y "%~dp0fixtures" "%RUNTIME%\app\fixtures" >nul
copy /y "%~dp0index.html" "%RUNTIME%\app\index.html" >nul
copy /y "%~dp0tsconfig.json" "%RUNTIME%\app\tsconfig.json" >nul
copy /y "%~dp0tsconfig.app.json" "%RUNTIME%\app\tsconfig.app.json" >nul
copy /y "%~dp0tsconfig.node.json" "%RUNTIME%\app\tsconfig.node.json" >nul
copy /y "%~dp0vite.config.ts" "%RUNTIME%\app\vite.config.ts" >nul
call "%RUNTIME%\node_modules\.bin\tsc.cmd" -b "%RUNTIME%\app\tsconfig.json"
if errorlevel 1 goto error
call "%RUNTIME%\node_modules\.bin\vitest.cmd" run --root "%RUNTIME%\app" --config "%RUNTIME%\vite.runtime.config.mjs"
if errorlevel 1 goto error
node "%RUNTIME%\node_modules\vite\bin\vite.js" build "%RUNTIME%\app" --config "%RUNTIME%\vite.runtime.config.mjs"
if errorlevel 1 goto error
if exist "%~dp0dist" rmdir /s /q "%~dp0dist"
mkdir "%~dp0dist"
xcopy /e /i /y "%RUNTIME%\app\dist" "%~dp0dist" >nul
echo.
echo Done: %~dp0dist
pause
exit /b 0
:error
echo Validation or build failed.
pause
exit /b 1
:installerror
echo Run run-naeil-special-canvas.bat once before building.
pause
exit /b 1

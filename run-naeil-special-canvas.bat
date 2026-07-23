@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 내일스패셜 캔버스
echo [내일스패셜 캔버스] 실행 준비 중...
set "RUNTIME=%LOCALAPPDATA%\NaeilSpecialCanvasRuntime"
if not exist "%RUNTIME%\node_modules\vite\bin\vite.js" (
  echo 처음 실행이라 필요한 파일을 설치합니다.
  if not exist "%RUNTIME%" mkdir "%RUNTIME%"
  copy /y "%~dp0runtime\package.json" "%RUNTIME%\package.json" >nul
  copy /y "%~dp0runtime\vite.runtime.config.mjs" "%RUNTIME%\vite.runtime.config.mjs" >nul
  call npm install --prefix "%RUNTIME%" --cache "%RUNTIME%\npm-cache" --no-audit --no-fund
  if errorlevel 1 goto error
)
copy /y "%~dp0runtime\vite.runtime.config.mjs" "%RUNTIME%\vite.runtime.config.mjs" >nul
if not exist "%RUNTIME%\app\src" mkdir "%RUNTIME%\app\src"
xcopy /e /i /y "%~dp0src" "%RUNTIME%\app\src" >nul
copy /y "%~dp0index.html" "%RUNTIME%\app\index.html" >nul
echo.
echo 브라우저 주소: http://127.0.0.1:4173
echo 종료하려면 이 창에서 Ctrl+C를 누르세요.
start "" http://127.0.0.1:4173
node "%RUNTIME%\node_modules\vite\bin\vite.js" "%RUNTIME%\app" --config "%RUNTIME%\vite.runtime.config.mjs" --host 127.0.0.1
exit /b 0
:error
echo.
echo 실행 준비 중 오류가 발생했습니다. 위 메시지를 확인해 주세요.
pause
exit /b 1

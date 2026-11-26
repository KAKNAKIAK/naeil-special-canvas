@echo off
chcp 65001 >nul
set "CANVAS_ELECTRON=%LOCALAPPDATA%\NaeilSpecialCanvasDesktopBuild\node_modules\electron\dist\electron.exe"
if not exist "%CANVAS_ELECTRON%" (
  echo Electron 개발 런타임이 없습니다. desktop/package.json의 개발 환경을 먼저 준비하세요.
  exit /b 1
)
if not exist "%~dp0dist\index.html" (
  echo 웹앱 빌드가 필요합니다. npm run build를 실행하세요.
  exit /b 1
)
start "" "%CANVAS_ELECTRON%" "%~dp0desktop\main.cjs"

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 내일스패셜 캔버스 EXE 빌드
set "WEBRUNTIME=%LOCALAPPDATA%\NaeilSpecialCanvasRuntime"
set "DESKTOPRUNTIME=%LOCALAPPDATA%\NaeilSpecialCanvasDesktopBuild"
set "PUBLISH_ARG="
if /i "%~1"=="--publish" set "PUBLISH_ARG=--publish always"
if not defined GH_TOKEN (
  for /f "usebackq delims=" %%i in (`gh auth token 2^>nul`) do set "GH_TOKEN=%%i"
)

echo [1/4] 웹앱 검사 및 빌드
call "%~dp0build-naeil-special-canvas.bat" <nul
if errorlevel 1 goto error

echo [2/4] 로컬 EXE 빌드 공간 준비
if not exist "%DESKTOPRUNTIME%" mkdir "%DESKTOPRUNTIME%"
copy /y "%~dp0desktop\package.json" "%DESKTOPRUNTIME%\package.json" >nul
copy /y "%~dp0desktop\main.cjs" "%DESKTOPRUNTIME%\main.cjs" >nul
copy /y "%~dp0desktop\preload.cjs" "%DESKTOPRUNTIME%\preload.cjs" >nul
if exist "%DESKTOPRUNTIME%\dist" rmdir /s /q "%DESKTOPRUNTIME%\dist"
xcopy /e /i /y "%~dp0dist" "%DESKTOPRUNTIME%\dist" >nul
if exist "%DESKTOPRUNTIME%\build-assets\naeil-special-canvas-writer" rmdir /s /q "%DESKTOPRUNTIME%\build-assets\naeil-special-canvas-writer"
xcopy /e /i /y "%~dp0..\.agents\skills\naeil-special-canvas-writer" "%DESKTOPRUNTIME%\build-assets\naeil-special-canvas-writer" >nul
if errorlevel 1 goto error

echo [3/4] Electron 빌드 도구 및 업데이트 모듈 확인
set "NEED_NPM_INSTALL=0"
if not exist "%DESKTOPRUNTIME%\node_modules\.bin\electron-builder.cmd" set "NEED_NPM_INSTALL=1"
if not exist "%DESKTOPRUNTIME%\node_modules\electron-updater\out\main.js" set "NEED_NPM_INSTALL=1"
if "%NEED_NPM_INSTALL%"=="1" (
  pushd "%DESKTOPRUNTIME%"
  call npm install --cache "%DESKTOPRUNTIME%\npm-cache" --no-audit --no-fund
  popd
  if errorlevel 1 goto error
)

echo [4/4] 작성 스킬 포함 NSIS 설치형 EXE 생성
if exist "%DESKTOPRUNTIME%\release" rmdir /s /q "%DESKTOPRUNTIME%\release"
call "%DESKTOPRUNTIME%\node_modules\.bin\electron-builder.cmd" --win nsis --x64 --projectDir "%DESKTOPRUNTIME%" %PUBLISH_ARG%
if errorlevel 1 goto error
if not exist "%~dp0release" mkdir "%~dp0release"
del /q "%~dp0release\*.exe" 2>nul
del /q "%~dp0release\*.blockmap" 2>nul
del /q "%~dp0release\latest*.yml" 2>nul
copy /y "%DESKTOPRUNTIME%\release\*.exe" "%~dp0release\" >nul
copy /y "%DESKTOPRUNTIME%\release\*.blockmap" "%~dp0release\" >nul
copy /y "%DESKTOPRUNTIME%\release\latest*.yml" "%~dp0release\" >nul
echo.
echo 완료: %~dp0release
pause
exit /b 0

:error
echo.
echo EXE 빌드에 실패했습니다. 위 오류를 확인해 주세요.
pause
exit /b 1

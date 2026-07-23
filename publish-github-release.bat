@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 내일스패셜 메이킹 스튜디오 GitHub Release 배포

for /f "usebackq delims=" %%T in (`gh auth token 2^>nul`) do set "GH_TOKEN=%%T"
if not defined GH_TOKEN (
  echo GitHub CLI 로그인이 필요합니다.
  echo 먼저 PowerShell에서 gh auth login 을 실행한 뒤 다시 시도해 주세요.
  pause
  exit /b 1
)

echo GitHub Release에 설치 파일과 업데이트 메타데이터를 게시합니다.
call "%~dp0build-exe.bat" --publish
set "GH_TOKEN="

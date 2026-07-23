# 내일스패셜 메이킹 스튜디오

PPT·Excel로 그리던 내일스패셜 기획안을 720px 웹 상세페이지 구조로 직접 편집하고, 디자이너 전달 자료까지 한 번에 만드는 로컬 웹앱입니다.

## Windows 설치 및 자동 업데이트

GitHub Releases에서 `내일스패셜-메이킹-스튜디오-Setup-<버전>.exe`를 내려받아 한 번 설치합니다. 이후 앱 실행 시 최신 버전을 자동으로 확인하고, 내려받기가 끝나면 즉시 재시작 또는 다음 종료 시 설치를 선택할 수 있습니다.

- 자동 저장 데이터: `%APPDATA%\NaeilSpecialCanvas`
- EXE 재빌드: `build-exe.bat`
- GitHub Release 게시: `publish-github-release.bat`
- 코드 서명이 없는 사내용 빌드이므로 처음 실행할 때 Windows SmartScreen 경고가 표시될 수 있습니다.

## 실행

`run-naeil-special-canvas.bat`를 더블클릭합니다. 첫 실행에서만 실행 라이브러리를 `%LOCALAPPDATA%\NaeilSpecialCanvasRuntime`에 설치하며 이후 `http://127.0.0.1:4173`이 열립니다. 실행할 때 최신 소스를 로컬 작업 공간으로 복사하므로 Google Drive 동기화 오류와 불필요한 수만 개 파일 생성을 피합니다.

## 기본 흐름

1. 왼쪽 **블록**에서 원하는 콘텐츠 유형을 추가합니다.
2. 캔버스 블록을 클릭하고 오른쪽에서 문구와 목록, 배경, 디자이너 메모를 입력합니다.
3. **이미지** 탭에 사진을 올리고 선택 블록에 연결합니다.
4. 오른쪽 **검수**에서 이미지 출처·권리·원본 여부를 확인합니다.
5. **내보내기 → 디자이너 전달 ZIP**으로 매니페스트, HTML, 이미지, 전달 메모를 묶습니다.

작업은 브라우저의 IndexedDB에 자동 저장됩니다. 서버로 전송되지 않습니다. 브라우저 데이터 삭제 전에 ZIP 또는 YAML로 백업하세요.

## 지원 산출물

- v2 Manifest YAML / JSON
- 독립 실행 HTML
- 전체 시안 PNG
- PDF/인쇄
- 디자이너 전달 ZIP

## 개발

```powershell
npm install
npm run dev
npm test
npm run build
```

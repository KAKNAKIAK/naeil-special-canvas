# 내일스패셜 메이킹 스튜디오

PPT·Excel로 그리던 내일스패셜 기획안을 720px 웹 상세페이지 구조로 직접 편집하고, 디자이너 전달 자료까지 한 번에 만드는 로컬 웹앱입니다.

## Windows 설치 및 자동 업데이트

GitHub Releases에서 `내일스패셜-메이킹-스튜디오-Setup-<버전>.exe`를 내려받아 한 번 설치합니다. 이후 앱 실행 시 최신 버전을 자동으로 확인하고, 내려받기가 끝나면 즉시 재시작 또는 다음 종료 시 설치를 선택할 수 있습니다.

- 자동 저장 데이터: `%APPDATA%\NaeilSpecialCanvas`
- EXE 재빌드: `build-exe.bat`
- GitHub Release 게시: `publish-github-release.bat`
- 코드 서명이 없는 사내용 빌드이므로 처음 실행할 때 Windows SmartScreen 경고가 표시될 수 있습니다.
- 설치본에는 `resources\\skills\\naeil-special-canvas-writer` 경로로 작성 스킬 원본 전체가 함께 포함됩니다.

## 다음 버전 배포

1. `desktop/package.json`의 `version`을 현재보다 높은 버전으로 올립니다. 예: `1.0.1` → `1.0.2`
2. 변경한 소스를 GitHub `main` 브랜치에 push합니다.
3. `publish-github-release.bat`를 실행합니다.

배치 파일은 GitHub CLI 로그인 정보를 사용해 설치 파일, `.blockmap`, `latest.yml`을 새 GitHub Release에 게시합니다. 기존 설치 사용자는 다음 앱 실행 시 새 버전을 확인합니다.

## 실행

`run-naeil-special-canvas.bat`를 더블클릭합니다. 첫 실행에서만 실행 라이브러리를 `%LOCALAPPDATA%\NaeilSpecialCanvasRuntime`에 설치하며 이후 `http://127.0.0.1:4173`이 열립니다. 실행할 때 최신 소스를 로컬 작업 공간으로 복사하므로 Google Drive 동기화 오류와 불필요한 수만 개 파일 생성을 피합니다.

## 기본 흐름

새 프로젝트·샘플·시작 템플릿은 기본 이미지 없이 열립니다. 이미지 칸에 상품 사진을 직접 업로드하거나 URL로 연결합니다.

AI 상품정보 기반 작성은 [템플릿 선택 온톨로지](docs/템플릿-선택-온톨로지.md)를 먼저 읽습니다. 상품 자료의 사실·테마·선택 관계를 시작 템플릿 4종·생성 블록 13종에 연결하고, CLI 작성·GUI 검수까지 진행하는 기준입니다. 저장소 AGENTS.md에도 선행 읽기와 기능 변경 시 문서 갱신 규칙을 연결했습니다. 문서의 앱 런타임 자동 로딩·설치본 동봉은 구현되어 있지 않습니다.

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

## CLI와 GUI 실시간 연동

v1.0.35부터 Getty 콘텐츠 코드는 숫자와 영문·숫자 조합을 모두 지원합니다. 입력값을 유지하며 공개 검색 결과와 상세 페이지의 코드가 정확히 일치할 때만 추가합니다. CLI는 `{"action":"asset.addGetty","args":["실제 콘텐츠 코드"]}`로 GUI와 같은 조회·추가 함수를 사용합니다. 테스트용 공개 페이지 응답으로 검증했으며 실제 사용하는 영숫자 코드의 실사이트 조회는 아직 미검증입니다.

앱 전용 CLI의 편집 명령은 열린 캔버스에 즉시 반영됩니다. AI가 연결된 JSON 파일을 직접 수정하는 방식은 파일 새로고침과 자동 감지로 확인합니다. 두 경우 모두 앱 전체를 재시작할 필요가 없습니다.

데스크톱에서 프로젝트 JSON을 불러오거나 저장하면 상단 `↻ 새로고침`으로 연결 파일을 다시 읽습니다. `자동 감지`는 기본으로 켜져 있으며 약 1.2초마다 외부 변경을 확인합니다. 하단 `마지막 반영`은 화면에 반영한 시각(초 단위)입니다. 저장하지 않은 앱 편집과 외부 변경이 겹치면 자동 반영과 연결 파일 자동 저장을 보류합니다. 새로고침 시 내용을 바꿀지 확인하며, 반영 전 내용은 실행 취소로 복원할 수 있습니다. 잘못된 JSON, 다른 프로젝트 ID, 삭제된 파일은 현재 캔버스를 유지하고 오류를 표시합니다.

CLI에서도 같은 기능을 사용합니다. `status.refresh`에서 연결 경로·자동 감지 여부·마지막 반영 시각·오류를 확인합니다.

```json
{"action":"project.refresh","args":[false]}
{"action":"project.autoRefresh","args":[true]}
```

`project.refresh`의 인자를 `true`로 지정하면 미저장 편집을 연결 파일 내용으로 교체합니다. 사용자 의도를 확인한 경우에만 사용합니다. 자동 감지를 끄려면 `project.autoRefresh`에 `false`를 전달합니다. 연결 파일이 없는 브라우저 실행판에서는 이 파일 기능을 사용할 수 없습니다. 설치본은 v1.0.34부터 지원합니다.

v1.0.34부터 설치본에 localhost CLI 브리지가 포함됩니다. 새로고침·반영 시각·외부 파일 자동 감지도 같은 버전에 포함됩니다.

1. v1.0.34 설치 앱을 엽니다. 소스 개발판은 웹앱을 빌드한 뒤 `run-naeil-special-desktop.bat`로 엽니다. 기존 로컬 Electron 개발 런타임과 자동 저장 폴더를 사용합니다.
2. 프로젝트 폴더의 PowerShell에서 아래 명령을 실행합니다. Node.js가 필요합니다.

```powershell
.\desktop\naeil-canvas.cmd status
.\desktop\naeil-canvas.cmd get

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
@{ action = 'project.rename'; args = @('겨울 여행') } |
    ConvertTo-Json -Compress |
    .\desktop\naeil-canvas.cmd dispatch --file -
```

GUI의 현재 프로젝트를 직접 수정하며 실행 취소/다시 실행과 자동 저장을 함께 사용합니다. GUI 변경은 다음 `get`에 반영됩니다. 브라우저 실행용 `run-naeil-special-canvas.bat`에는 Electron 브리지가 제공되지 않습니다.

`status` 응답의 `actions`에 명령 이름과 `args` 순서가 나옵니다. 현재 프로젝트명·페이지 정보, 블록 추가/편집/복제/삭제/이동/선택, 목록·표·아이콘 카드 항목, 이미지 연결 ID·레이아웃, 그룹 생성/해제, 실행 취소/다시 실행, 저장, 검수와 내보내기를 지원합니다. 이미지 연결은 현재 프로젝트의 이미지 ID를 사용합니다. 로컬 파일 불러오기·이미지 업로드와 상세 카드 배치 등 등록되지 않은 기능은 GUI에서 실행합니다.

```json
{"action":"section.add","args":["text"]}
{"action":"section.update","args":["get에서 확인한 블록 ID",{"title":"여행 안내","body":"확인한 상품 내용"}],"expectedRevision":3}
{"action":"history.undo","args":[]}
{"action":"export.html","args":[]}
```

각 줄은 별도 명령 객체입니다. JSON 파일에 저장한 뒤 실행할 수 있습니다.

```powershell
.\desktop\naeil-canvas.cmd dispatch --file command.json
.\desktop\naeil-canvas.cmd dispatch --file export-command.json --out result.html
```

`expectedRevision`에 직전 `get`의 revision을 넣으면 이후 GUI 또는 다른 CLI에서 수정했을 때 충돌 오류를 반환합니다. 입력 검사·충돌 검사에서 거부된 변경은 반영되지 않습니다. 성공 응답은 화면 상태 반영을 뜻하며, 파일 저장은 기존 자동 저장 주기를 따릅니다. `project.save`는 GUI 저장 창을 사용할 수 있고 긴 작업은 통신 시간 제한을 넘을 수 있으므로 오류 발생 시 재실행 전 GUI 상태를 확인합니다.

앱은 `%APPDATA%\NaeilSpecialCanvas\cli-connection.json`에 매 실행의 연결 정보를 저장합니다. 파일에는 인증 토큰이 있으므로 공유하지 않습니다. 별도 테스트 앱에는 `--connection FILE`을 사용합니다. 패키징 시 CLI는 `resources\cli`에 동봉됩니다.

추가·변경 기능은 `AGENTS.md`에 따라 GUI와 CLI 진입점을 함께 구현하고 공통 편집 함수를 사용합니다. 검증된 범위는 TypeScript, Vitest 56건, desktop Node 7건, 실제 Electron 프리셋 4종의 기본 이미지 없음·양방향 편집·실행 취소/다시 실행·충돌·잘못된 입력 거부·HTML 내보내기·IndexedDB 자동 저장입니다. v1.0.34는 Windows x64 NSIS 설치 파일로 패키징합니다. `scripts/release-check.cjs`는 Setup의 해시·실제 payload·CLI/스킬 동봉과 격리된 패키징 앱 실행·스킬 동기화를 검사합니다. 사용자 PC의 기존 설치본을 강제 종료하거나 교체하지 않습니다.

2026-11-26 새로고침 검증: 위 검증에 연결 파일 GUI/CLI 새로고침·시각 표시·자동 감지 토글·잘못된 JSON/구조/스키마/ID 보존·동시 편집 충돌과 확인 취소/수락·실행 취소·삭제/교체 복구·자체 저장 반복 방지를 추가해 실제 Electron 16개 시나리오를 통과했습니다. 외부 도구와 OS 파일 잠금을 공유하지 않으므로 완전히 동시인 파일 쓰기까지 보장하는 공동 편집 기능은 아닙니다.

## 개발 검증

```powershell
npm install
npm run dev
npm test
npm run build
```

Electron 개발 런타임으로 `scripts/cli-live-check.cjs`를 실행하면 임시 작업 공간에서 실제 GUI와 CLI 연결을 검증합니다. 이 검증은 테스트 프로세스를 종료하며 기존 사용자 프로젝트를 사용하지 않습니다.

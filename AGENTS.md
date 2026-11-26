# 내일스패셜 메이킹 스튜디오 — 배포 작업 규칙

이 프로젝트에서 사용자가 아래와 유사한 요청을 하면, 이 문서의 배포 절차를 따른다.

```text
G:\내 드라이브\안티그래비티\naeil-special-canvas의 현재 변경사항을 빌드하고 GitHub 자동 업데이트 Release까지 배포해줘.
```

## 상품 문서에서 AI 캔버스 작성

- 상품 관련 문서·일정표·견적·호텔 자료를 받아 캔버스를 작성할 때 `docs/템플릿-선택-온톨로지.md`를 먼저 읽는다. 현재 `schema/project.schema.json`, `schema/block-catalog.json`과 실행 중 CLI `status`를 함께 확인한다.
- 상품의 대상 고객·동선·선택 조건·비교 대상·행사 구조와 근거를 추출하고, 온톨로지의 조건으로 시작 템플릿과 추가 블록을 선택한다. 예시 상품의 혜택·날짜·문구를 판매 사실로 사용하지 않는다.
- 사용자가 요청한 작성 범위에서 상품별 구성안과 확인 필요 항목을 정리한 뒤 지원되는 CLI action으로 GUI에 반영한다. 명령마다 실제 ID·최신 revision·반영 결과를 조회한다.
- 프리셋·블록·필드 의미·CLI 지원 범위가 바뀌면 온톨로지의 선택 기준·예시·실행 절차를 같은 작업에서 갱신한다.
- 지원되지 않는 단계는 문서의 현재 한계에 따라 표시한다. 실행하지 않은 프로젝트 생성·이미지 업로드·내보내기를 완료로 보고하지 않는다.

## GUI와 CLI 기능 동기화

- GUI와 CLI는 같은 프로젝트 상태와 편집 함수를 사용한다. CLI 전용 편집 엔진이나 별도 프로젝트 복사본을 만들지 않는다.
- GUI 또는 CLI에 기능을 추가·변경하면 같은 작업에서 다른 쪽 진입점도 함께 구현·검증한다. 한쪽만 수정한 상태를 완료로 보고하지 않는다.
- 편집 로직은 기존 `App.tsx` 함수 또는 공유 모듈에 두고, GUI 이벤트와 `editorActions`가 동일한 함수를 호출하게 한다.
- 새 편집 기능은 `editorActions`에 이름·인자·읽기 전용 여부를 등록하고 `src/cli-commands.ts`의 입력 검사와 CLI 도움말·README 사용법을 함께 갱신한다. `status`에서 기능과 인자를 조회할 수 있어야 한다.
- CLI 변경은 GUI 렌더링·실행 취소/다시 실행·자동 저장에 반영되어야 한다. GUI 변경은 CLI `get`으로 즉시 조회되어야 한다.
- 입력 오류·읽기 전용·revision 충돌은 상태를 바꾸기 전에 거부한다. 임의 JavaScript 실행 명령은 제공하지 않는다. 비동기 작업은 실제 완료/실패를 반환한다.
- 로컬 브리지의 localhost 제한·토큰 인증·연결 파일 정리를 유지하며 토큰을 출력하거나 기록하지 않는다.
- 필수 검증은 TypeScript, Vitest, desktop Node 테스트, `scripts/cli-live-check.cjs`의 양방향 실시간 검증이다. 변경한 기능은 GUI와 CLI 양쪽 정상 경로로 확인한다.
- 패키징 파일을 추가하면 `desktop/package.json`과 `build-exe.bat`의 복사 대상도 함께 수정한다. 실행·미배포 상태와 한계는 README와 작업일지에 기록한다.

## 대상과 배포 방식

- 프로젝트: `G:\내 드라이브\안티그래비티\naeil-special-canvas`
- GitHub: `KAKNAKIAK/naeil-special-canvas` (public)
- 앱: 내일스패셜 메이킹 스튜디오
- 배포: Windows x64 NSIS Setup + GitHub Releases + `electron-updater`
- 최초 설치: `naeil-special-canvas-Setup-<version>.exe`
- 기존 포터블 EXE는 자동 업데이트 대상이 아님

## 실행 권한

- 사용자가 `빌드`, `EXE 빌드`, `Release`, `배포`, `자동 업데이트 배포`를 명시한 경우에만 빌드·GitHub push·Release 생성을 실행한다.
- 단순 코드 수정 요청만 받은 경우에는 테스트까지만 하고, EXE 빌드와 Release 게시를 자동으로 수행하지 않는다.

## 배포 절차

1. `작업일지.md`와 `git status --short`를 확인한다.
2. `desktop/package.json`의 `version`을 현재 GitHub 최신 Release보다 높은 버전으로 올린다.
3. `build-exe.bat`를 실행한다.
4. 계약 검사, TypeScript, Vitest, Vite production build가 모두 통과했는지 확인한다.
5. `release` 폴더에 아래 최신 파일만 남긴다.
   - `naeil-special-canvas-Setup-<version>.exe`
   - `naeil-special-canvas-Setup-<version>.exe.blockmap`
   - `latest.yml`
   - `SHA256SUMS.txt`
6. `latest.yml`의 EXE 파일명과 SHA-512가 실제 Setup EXE와 일치하는지 확인한다.
7. Setup 내부에 아래 파일이 존재하는지 확인한다.

```text
resources\skills\naeil-special-canvas-writer\SKILL.md
```

또한 설치본을 한 번 실행한 뒤, 앱 전용 사용자 폴더에도 아래 파일이 동기화되는지 확인한다. 공용 `.agents` 또는 `.codex` 폴더는 절대 수정하지 않는다.

```text
%APPDATA%\NaeilSpecialCanvas\skills\naeil-special-canvas-writer\SKILL.md
```

8. 변경 소스를 커밋하고 `main` 브랜치에 push한다.
9. `gh auth status`로 GitHub CLI 로그인을 확인한 뒤 `publish-github-release.bat` 또는 동등한 `gh release create` 절차로 Release를 게시한다.
10. Release가 draft/prerelease가 아닌지, 업로드된 EXE SHA-256이 로컬 파일과 같은지 확인한다.
11. `작업일지.md`에 버전·빌드·검증·Release URL을 기록한다.

## 필수 검증값

- 자동 업데이트 메타데이터: `release\latest.yml`
- 업데이트 blockmap: `release\naeil-special-canvas-Setup-<version>.exe.blockmap`
- 패키징된 앱 업데이트 설정: `resources\app-update.yml`

`app-update.yml`에는 아래 값이 있어야 한다.

```yaml
provider: github
owner: KAKNAKIAK
repo: naeil-special-canvas
releaseType: release
```

## 금지 사항

- 테스트 실패, Setup 누락, blockmap 누락, `latest.yml` 파일명 불일치, 해시 불일치 상태에서는 Release를 만들지 않는다.
- EXE만 단독 업로드하지 않는다. EXE·blockmap·`latest.yml`은 항상 한 Release에 함께 게시한다.
- 사용자 지시 없이 버전 증가, GitHub push, Release 생성, 구버전 삭제를 하지 않는다.
- GitHub CLI 인증이 없으면 `gh auth login`을 요청하고 배포를 중단한다.

## 완료 보고

완료 시 아래만 짧게 보고한다.

```text
- 버전:
- Setup 파일:
- SHA-256:
- 테스트 결과:
- 스킬 동봉 확인:
- Release URL:
```

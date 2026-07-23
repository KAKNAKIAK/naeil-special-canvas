# 내일스패셜 메이킹 스튜디오 — 배포 작업 규칙

이 프로젝트에서 사용자가 아래와 유사한 요청을 하면, 이 문서의 배포 절차를 따른다.

```text
G:\내 드라이브\안티그래비티\naeil-special-canvas의 현재 변경사항을 빌드하고 GitHub 자동 업데이트 Release까지 배포해줘.
```

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
